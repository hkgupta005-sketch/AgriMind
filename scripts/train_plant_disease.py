import argparse
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")   # hide TensorFlow's info messages

import numpy as np
import matplotlib
matplotlib.use("Agg")                                 # save plots to files (works without a screen)
import matplotlib.pyplot as plt
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
from sklearn.metrics import (accuracy_score, classification_report, confusion_matrix,
                             precision_recall_fscore_support)

# ------------------------------------------------------------
# Settings
# ------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent   # Smart-Agriculture/
DEFAULT_DATA_DIR = PROJECT_ROOT / "data" / "plant_disease"
MODELS_DIR = PROJECT_ROOT / "models"
REPORTS_DIR = PROJECT_ROOT / "reports"
MODEL_PATH = MODELS_DIR / "plant_disease_model.keras"
CLASS_NAMES_PATH = MODELS_DIR / "class_names.json"

IMG_SIZE = (224, 224)
BATCH_SIZE = 32
VALIDATION_SPLIT = 0.2
SEED = 42                     # same seed = same train/validation split every run
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".gif"}


# ------------------------------------------------------------
# 1. Check the dataset folder
# ------------------------------------------------------------
def check_dataset(data_dir):
    if not data_dir.exists():
        sys.exit(f"ERROR: Dataset folder not found: {data_dir}")

    class_dirs = sorted(d for d in data_dir.iterdir() if d.is_dir())
    if len(class_dirs) < 2:
        sys.exit(f"ERROR: Need at least 2 class folders inside {data_dir}, found {len(class_dirs)}.\n"
                 "Make sure data_dir points to the folder that directly contains the class folders.")

    print(f"\nDataset folder: {data_dir}")
    print(f"Found {len(class_dirs)} class folders:")
    total = 0
    for d in class_dirs:
        count = sum(1 for f in d.iterdir() if f.suffix.lower() in IMAGE_EXTENSIONS)
        total += count
        print(f"  {d.name:<50} {count:>6} images")
    if total == 0:
        sys.exit("ERROR: No images found in the class folders.")
    print(f"Total images: {total}")


# ------------------------------------------------------------
# 2. Load the images (80% train, 20% validation)
# ------------------------------------------------------------
def load_datasets(data_dir):
    print("\nLoading images...")
    common = dict(
        validation_split=VALIDATION_SPLIT,
        seed=SEED,
        image_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
        label_mode="int",          # labels as 0, 1, 2 ... (for sparse_categorical_crossentropy)
        color_mode="rgb",
    )
    train_ds = keras.utils.image_dataset_from_directory(data_dir, subset="training",
                                                        shuffle=True, **common)
    val_ds = keras.utils.image_dataset_from_directory(data_dir, subset="validation",
                                                      shuffle=True, **common)

    class_names = train_ds.class_names       # detected automatically from folder names
    print(f"Detected {len(class_names)} classes")

    # prefetch = prepare the next batch while the current one is training (faster)
    train_ds = train_ds.prefetch(tf.data.AUTOTUNE)
    val_ds = val_ds.prefetch(tf.data.AUTOTUNE)
    return train_ds, val_ds, class_names


# ------------------------------------------------------------
# 3. Build the CNN
# ------------------------------------------------------------
def build_model(num_classes):
    # augmentation is only active during training, not during evaluation/prediction
    augmentation = keras.Sequential([
        layers.RandomFlip("horizontal_and_vertical"),
        layers.RandomRotation(0.1),
        layers.RandomZoom(0.1),
    ], name="augmentation")

    model = keras.Sequential([
        layers.Input(shape=IMG_SIZE + (3,)),
        layers.Rescaling(1.0 / 255),            # 0-255 -> 0-1 (done INSIDE the model)
        augmentation,

        layers.Conv2D(32, 3, padding="same", activation="relu"),
        layers.MaxPooling2D(),
        layers.Conv2D(64, 3, padding="same", activation="relu"),
        layers.MaxPooling2D(),
        layers.Conv2D(128, 3, padding="same", activation="relu"),
        layers.MaxPooling2D(),

        layers.Flatten(),
        layers.Dense(128, activation="relu"),
        layers.Dropout(0.5),
        layers.Dense(num_classes, activation="softmax"),   # one output per detected class
    ], name="plant_disease_cnn")

    model.compile(
        optimizer=keras.optimizers.Adam(),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


# ------------------------------------------------------------
# 4. Train
# ------------------------------------------------------------
def train_model(model, train_ds, val_ds, epochs):
    callbacks = [
        # stop if validation loss doesn't improve for 3 epochs, keep the best weights
        keras.callbacks.EarlyStopping(monitor="val_loss", patience=3,
                                      restore_best_weights=True, verbose=1),
        # save the best model so far after every epoch
        keras.callbacks.ModelCheckpoint(str(MODEL_PATH), monitor="val_accuracy",
                                        save_best_only=True, verbose=1),
    ]
    print(f"\nTraining for up to {epochs} epochs...")
    print("(On CPU this can take a long time for a large dataset.)\n")
    history = model.fit(train_ds, validation_data=val_ds, epochs=epochs, callbacks=callbacks)
    return history


# ------------------------------------------------------------
# 5. Print and plot the training history
# ------------------------------------------------------------
def show_history(history):
    h = history.history
    print("\nEpoch | Train Acc | Val Acc | Train Loss | Val Loss")
    for i in range(len(h["accuracy"])):
        print(f"{i + 1:>5} | {h['accuracy'][i]:>9.4f} | {h['val_accuracy'][i]:>7.4f} | "
              f"{h['loss'][i]:>10.4f} | {h['val_loss'][i]:>8.4f}")

    epochs = range(1, len(h["accuracy"]) + 1)

    plt.figure(figsize=(8, 5))
    plt.plot(epochs, h["accuracy"], "o-", label="Training accuracy")
    plt.plot(epochs, h["val_accuracy"], "o-", label="Validation accuracy")
    plt.title("Training vs Validation Accuracy")
    plt.xlabel("Epoch"); plt.ylabel("Accuracy"); plt.legend(); plt.grid(True)
    plt.savefig(REPORTS_DIR / "accuracy.png", bbox_inches="tight")
    plt.close()

    plt.figure(figsize=(8, 5))
    plt.plot(epochs, h["loss"], "o-", label="Training loss")
    plt.plot(epochs, h["val_loss"], "o-", label="Validation loss")
    plt.title("Training vs Validation Loss")
    plt.xlabel("Epoch"); plt.ylabel("Loss"); plt.legend(); plt.grid(True)
    plt.savefig(REPORTS_DIR / "loss.png", bbox_inches="tight")
    plt.close()

    print(f"\nSaved graphs: {REPORTS_DIR / 'accuracy.png'} and {REPORTS_DIR / 'loss.png'}")


# ------------------------------------------------------------
# 6. Evaluate on the validation set
# ------------------------------------------------------------
def evaluate_model(model, val_ds, class_names):
    print("\nEvaluating on the validation set...")
    y_true, y_pred = [], []
    # take labels and predictions from the SAME batch so they always line up
    for images, labels in val_ds:
        probs = model.predict_on_batch(images)
        y_true.extend(labels.numpy())
        y_pred.extend(np.argmax(probs, axis=1))
    y_true, y_pred = np.array(y_true), np.array(y_pred)

    all_labels = list(range(len(class_names)))
    acc = accuracy_score(y_true, y_pred)
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_true, y_pred, labels=all_labels, average="macro", zero_division=0)

    print(f"\nAccuracy:           {acc:.4f}")
    print(f"Precision (macro):  {precision:.4f}")
    print(f"Recall (macro):     {recall:.4f}")
    print(f"F1-score (macro):   {f1:.4f}")

    print("\nClassification report:")
    print(classification_report(y_true, y_pred, labels=all_labels,
                                target_names=class_names, zero_division=0))

    cm = confusion_matrix(y_true, y_pred, labels=all_labels)
    print("Confusion matrix (rows = actual, columns = predicted):")
    print(cm)

    # confusion matrix as a picture (easier to read with many classes)
    size = max(6, len(class_names) * 0.45)
    fig, ax = plt.subplots(figsize=(size, size))
    im = ax.imshow(cm, cmap="Greens")
    ax.set_xticks(all_labels); ax.set_yticks(all_labels)
    ax.set_xticklabels(class_names, rotation=90, fontsize=7)
    ax.set_yticklabels(class_names, fontsize=7)
    ax.set_xlabel("Predicted"); ax.set_ylabel("Actual"); ax.set_title("Confusion Matrix")
    fig.colorbar(im, fraction=0.046)
    fig.savefig(REPORTS_DIR / "confusion_matrix.png", bbox_inches="tight")
    plt.close(fig)
    print(f"Saved confusion matrix picture: {REPORTS_DIR / 'confusion_matrix.png'}")


# ------------------------------------------------------------
# Main
# ------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Train a plant disease CNN")
    parser.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR),
                        help="folder that contains one sub-folder per class")
    parser.add_argument("--epochs", type=int, default=10)
    args = parser.parse_args()

    data_dir = Path(args.data_dir).resolve()
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    gpus = tf.config.list_physical_devices("GPU")
    print(f"TensorFlow {tf.__version__} | running on {'GPU' if gpus else 'CPU'}")

    check_dataset(data_dir)
    train_ds, val_ds, class_names = load_datasets(data_dir)

    # save class names right away (the order matches the model's output neurons)
    with open(CLASS_NAMES_PATH, "w") as f:
        json.dump(class_names, f, indent=2)
    print(f"Saved class names: {CLASS_NAMES_PATH}")

    model = build_model(len(class_names))
    model.summary()

    history = train_model(model, train_ds, val_ds, args.epochs)
    show_history(history)

    # EarlyStopping restored the best weights; save the final best model
    model.save(MODEL_PATH)
    print(f"\nSaved model: {MODEL_PATH}")

    evaluate_model(model, val_ds, class_names)
    print("\nDone! Next step: python scripts/predict.py path/to/leaf.jpg")


if __name__ == "__main__":
    main()