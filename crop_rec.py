import joblib
import pandas as pd
import numpy as np
from sklearn.model_selection import StratifiedShuffleSplit, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report

# ------------------------------------------------------------
# 1. Load
# ------------------------------------------------------------
df = pd.read_csv('crop_rec.csv')
print("Original shape:", df.shape)

# ------------------------------------------------------------
# 2. Clean the data
# ------------------------------------------------------------
df.columns = df.columns.str.strip()
df['label'] = df['label'].astype(str).str.strip().str.lower()

num_features = ['N', 'P', 'K', 'temperature', 'humidity', 'ph', 'rainfall']

for col in num_features:
    df[col] = pd.to_numeric(df[col], errors='coerce')

df = df.dropna()
df = df.drop_duplicates()

# remove physically impossible values
df = df[(df[['N', 'P', 'K', 'rainfall']] >= 0).all(axis=1)]
df = df[df['humidity'].between(0, 100)]
df = df[df['ph'].between(0, 14)]
df = df.reset_index(drop=True)

print("Shape after cleaning:", df.shape)
print("Number of crops:", df['label'].nunique())

# ------------------------------------------------------------
# 3. Stratified train/test split on the crop label
# ------------------------------------------------------------
split = StratifiedShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
for train_index, test_index in split.split(df, df['label']):
    train_set = df.iloc[train_index]
    test_set = df.iloc[test_index]

X_train = train_set[num_features]
y_train = train_set['label'].copy()
X_test = test_set[num_features]
y_test = test_set['label'].copy()

# ------------------------------------------------------------
# 4. Scale
# ------------------------------------------------------------
scaler = StandardScaler()
X_train_scaled = pd.DataFrame(scaler.fit_transform(X_train), columns=num_features)
X_test_scaled = pd.DataFrame(scaler.transform(X_test), columns=num_features)

# ------------------------------------------------------------
# 5. Cross-validation (Random Forest was the best model)
# ------------------------------------------------------------
model = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
scores = cross_val_score(model, X_train_scaled, y_train, scoring='accuracy', cv=10, n_jobs=-1)
print(f"\nRandom Forest CV accuracy: {scores.mean():.4f} (± {scores.std():.4f})")

# ------------------------------------------------------------
# 6. Final check on the test set
# ------------------------------------------------------------
model.fit(X_train_scaled, y_train)
test_pred = model.predict(X_test_scaled)
print("Test accuracy:", round(accuracy_score(y_test, test_pred), 4))
print(classification_report(y_test, test_pred))

# ------------------------------------------------------------
# 7. Final model for the website: retrain on ALL data
#    (the test score above is the score we report, not a new one)
# ------------------------------------------------------------
final_scaler = StandardScaler()
X_all = pd.DataFrame(final_scaler.fit_transform(df[num_features]), columns=num_features)
final_model = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
final_model.fit(X_all, df['label'])

# ------------------------------------------------------------
# 8. Save with joblib
# ------------------------------------------------------------
ranges = {col: (float(df[col].min()), float(df[col].max())) for col in num_features}

joblib.dump({
    'model': final_model,
    'scaler': final_scaler,
    'num_features': num_features,
    'ranges': ranges,                      # to warn about out-of-range inputs
    'crops': sorted(df['label'].unique().tolist()),
}, 'crop_rec_model.pkl', compress=3)

print("Model saved to crop_rec_model.pkl")