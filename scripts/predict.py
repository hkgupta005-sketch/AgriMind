"""
Predict the disease for one leaf image using the trained model.

Run from the project root (Smart-Agriculture/):
    python scripts/predict.py path/to/leaf.jpg
"""

import json
import os
import sys
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import numpy as np
from PIL import Image, UnidentifiedImageError
from tensorflow import keras

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = PROJECT_ROOT / "models" / "plant_disease_model.keras"
CLASS_NAMES_PATH = PROJECT_ROOT / "models" / "class_names.json"
IMG_SIZE = (224, 224)

_model = None
_class_names = None


def load_model_and_classes():
    """Load the model and class names once, then reuse them."""
    global _model, _class_names
    if _model is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(f"Model not found: {MODEL_PATH}. Run training first.")
        if not CLASS_NAMES_PATH.exists():
            raise FileNotFoundError(f"Class names not found: {CLASS_NAMES_PATH}. Run training first.")
        _model = keras.models.load_model(MODEL_PATH)
        with open(CLASS_NAMES_PATH) as f:
            _class_names = json.load(f)
    return _model, _class_names


def predict_disease(image_path, top=3):
    image_path = Path(image_path)
    if not image_path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    model, class_names = load_model_and_classes()

    # load -> RGB -> resize to 224x224 -> NumPy array
    try:
        img = Image.open(image_path).convert("RGB").resize(IMG_SIZE)
    except UnidentifiedImageError:
        raise ValueError(f"Not a valid image file: {image_path}")
    arr = np.array(img, dtype="float32")

    # NOTE: no /255 here. The model has a Rescaling(1/255) layer inside it,
    # so it normalizes by itself. Dividing here too would normalize twice
    # and give wrong predictions.

    arr = np.expand_dims(arr, axis=0)          # (224, 224, 3) -> (1, 224, 224, 3)

    probs = model.predict(arr, verbose=0)[0]
    best = int(np.argmax(probs))

    top_idx = np.argsort(probs)[::-1][:top]
    return {
        "disease": class_names[best],
        "confidence": round(float(probs[best]), 4),
        "top_predictions": [
            {"disease": class_names[i], "confidence": round(float(probs[i]), 4)}
            for i in top_idx
        ],
    }


if __name__ == "__main__":
    IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

    def clean_path(text):
        """Accept paths the way Windows gives them: with quotes ("Copy as path"),
        or with & '...' (drag-and-drop into PowerShell)."""
        text = text.strip()
        if text.startswith("& "):
            text = text[2:].strip()
        return text.strip('"').strip("'")

    def choose_file_window():
        """Open a normal Windows 'Open file' window. Returns '' if not possible or cancelled."""
        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)          # show the window in front
            path = filedialog.askopenfilename(
                title="Choose a leaf photo",
                filetypes=[("Images", "*.jpg *.jpeg *.png *.bmp *.webp"), ("All files", "*.*")])
            root.destroy()
            return path or ""
        except Exception:
            return ""

    def pick_from_folder(folder):
        """A folder was given: list its photos and let the user pick one."""
        photos = sorted(p for p in folder.iterdir() if p.suffix.lower() in IMAGE_TYPES)
        if not photos:
            print("   No photos in this folder.")
            return None
        shown = photos[:20]
        print(f"   {len(photos)} photos in this folder. First {len(shown)}:")
        for i, p in enumerate(shown, 1):
            print(f"   {i:>2}. {p.name}")
        text = input(f"   Choose 1-{len(shown)} (Enter = 1): ").strip()
        if text == "":
            return shown[0]
        if text.isdigit() and 1 <= int(text) <= len(shown):
            return shown[int(text) - 1]
        print("   Please type a number from the list.")
        return None

    def ask_photo():
        print("\nWhich leaf photo do you want to check?")
        print("   • Press Enter to choose the photo in a window, or")
        print("   • drag the photo into this terminal, or paste its path.")
        while True:
            text = clean_path(input("   Photo: "))
            if text == "":
                text = choose_file_window()
                if not text:
                    print("   No window available. Please paste or drag the photo path instead.")
                    continue
                print(f"   {text}")
            path = Path(text)
            if path.is_dir():
                chosen = pick_from_folder(path)
                if chosen:
                    return chosen
                continue
            if not path.exists():
                print("   That file was not found. Check the path and try again.")
                continue
            if path.suffix.lower() not in IMAGE_TYPES:
                print("   That is not a photo. Use a JPG or PNG file.")
                continue
            return path

    def show(result):
        plant, _, condition = result["disease"].partition("___")
        plant = plant.replace("_", " ").replace(",", "")
        condition = condition.replace("_", " ").strip()
        pct = result["confidence"] * 100

        print("\n" + "-" * 50)
        if "healthy" in condition.lower():
            print(f"  {plant} leaf: HEALTHY ✓")
            print("  No disease found. Keep checking the plants regularly.")
        else:
            print(f"  {plant} leaf: {condition}")
            print("  This looks like a disease. Show the plant to your local")
            print("  Krishi Vigyan Kendra (KVK) or agriculture officer before spraying.")
        print(f"  Confidence: {pct:.1f}%")
        if pct < 60:
            print("  ⚠ The model is not sure. Take a clearer photo: one leaf,")
            print("    in daylight, on a plain background, filling the frame.")
        print("-" * 50)
        others = result["top_predictions"][1:]
        if others:
            print("  Other possibilities (how unsure the model is, not other diseases):")
            for p in others:
                print(f"    {p['disease'].replace('___', ' – ').replace('_', ' '):<45} {p['confidence'] * 100:5.1f}%")

    print("=" * 50)
    print("  AgriMind: check a leaf for disease")
    print("=" * 50)

    # A photo can still be given on the command line: python scripts/predict.py leaf.jpg
    first = Path(clean_path(sys.argv[1])) if len(sys.argv) > 1 else None

    print("Loading the model (first time takes a few seconds)...")
    try:
        load_model_and_classes()
    except FileNotFoundError as e:
        sys.exit(f"ERROR: {e}")

    try:
        while True:
            photo = first if first and first.is_file() else ask_photo()
            first = None
            try:
                show(predict_disease(photo))
            except (FileNotFoundError, ValueError) as e:
                print(f"   Could not check this photo: {e}")

            again = input("\nCheck another photo? (y/n): ").strip().lower()
            if again not in ("y", "yes", "haan", "ha"):
                break
    except (KeyboardInterrupt, EOFError):      # Ctrl+C: stop quietly instead of a long error
        pass
    print("\nBye! 🌱")