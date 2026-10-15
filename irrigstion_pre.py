import joblib
import pandas as pd
import numpy as np
from sklearn.model_selection import StratifiedShuffleSplit, cross_val_score
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import accuracy_score, f1_score, classification_report, confusion_matrix

# ------------------------------------------------------------
# 1. Load
# ------------------------------------------------------------
df = pd.read_csv('irrigation_prediction.csv')
print("Original shape:", df.shape)

target = 'Irrigation_Need'
num_features = ['Soil_pH', 'Soil_Moisture', 'Organic_Carbon', 'Electrical_Conductivity',
                'Temperature_C', 'Humidity', 'Rainfall_mm', 'Sunlight_Hours',
                'Wind_Speed_kmh', 'Field_Area_hectare', 'Previous_Irrigation_mm']
cat_features = ['Soil_Type', 'Crop_Type', 'Crop_Growth_Stage', 'Season',
                'Irrigation_Type', 'Water_Source', 'Mulching_Used', 'Region']

# ------------------------------------------------------------
# 2. Clean the data
# ------------------------------------------------------------
df.columns = df.columns.str.strip()

for col in cat_features + [target]:
    df[col] = df[col].astype(str).str.strip().str.title()
for col in num_features:
    df[col] = pd.to_numeric(df[col], errors='coerce')

df = df.dropna()
df = df.drop_duplicates()

# remove physically impossible values
df = df[df['Soil_pH'].between(0, 14)]
df = df[df['Humidity'].between(0, 100)]
df = df[df['Soil_Moisture'].between(0, 100)]
df = df[df['Sunlight_Hours'].between(0, 24)]
non_negative = ['Organic_Carbon', 'Electrical_Conductivity', 'Rainfall_mm',
                'Wind_Speed_kmh', 'Field_Area_hectare', 'Previous_Irrigation_mm']
df = df[(df[non_negative] >= 0).all(axis=1)]
df = df.reset_index(drop=True)

print("Shape after cleaning:", df.shape)
print("Class balance:\n", df[target].value_counts())

# ------------------------------------------------------------
# 3. Stratified split on the target
# ------------------------------------------------------------
split = StratifiedShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
for train_index, test_index in split.split(df, df[target]):
    train_set = df.iloc[train_index]
    test_set = df.iloc[test_index]

y_train = train_set[target].copy()
y_test = test_set[target].copy()

# ------------------------------------------------------------
# 4. Scale numeric + one-hot encode categorical
# ------------------------------------------------------------
scaler = StandardScaler()
encoder = OneHotEncoder(sparse_output=False, handle_unknown='ignore')

def prepare(data, fit=False):
    if fit:
        num = scaler.fit_transform(data[num_features])
        cat = encoder.fit_transform(data[cat_features])
    else:
        num = scaler.transform(data[num_features])
        cat = encoder.transform(data[cat_features])
    num_df = pd.DataFrame(num, columns=num_features)
    cat_df = pd.DataFrame(cat, columns=encoder.get_feature_names_out(cat_features))
    return pd.concat([num_df, cat_df], axis=1)

X_train = prepare(train_set, fit=True)
X_test = prepare(test_set)
print("Final train shape:", X_train.shape)

# ------------------------------------------------------------
# 5. Cross-validation (Decision Tree was the best model)
#    'High' is only ~3% of rows -> also look at f1_macro, not just accuracy
# ------------------------------------------------------------
model = DecisionTreeClassifier(random_state=42, class_weight='balanced')
acc = cross_val_score(model, X_train, y_train, scoring='accuracy', cv=10, n_jobs=-1)
f1 = cross_val_score(model, X_train, y_train, scoring='f1_macro', cv=10, n_jobs=-1)
print(f"\nDecision Tree CV:  accuracy = {acc.mean():.4f}   f1_macro = {f1.mean():.4f}")

# ------------------------------------------------------------
# 6. Final evaluation on the test set
# ------------------------------------------------------------
model.fit(X_train, y_train)
test_pred = model.predict(X_test)

print("\nTest accuracy:", round(accuracy_score(y_test, test_pred), 4))
print("Test f1_macro:", round(f1_score(y_test, test_pred, average='macro'), 4))
print(classification_report(y_test, test_pred))

labels = ['Low', 'Medium', 'High']
print("Confusion matrix (rows = actual, cols = predicted):")
print(pd.DataFrame(confusion_matrix(y_test, test_pred, labels=labels), index=labels, columns=labels))

importance = pd.Series(model.feature_importances_, index=X_train.columns)
print("\nTop 10 features:\n", importance.sort_values(ascending=False).head(10))

# ------------------------------------------------------------
# 7. Final model for the website: retrain on ALL data
#    (the test score above is the score we report)
# ------------------------------------------------------------
final_scaler = StandardScaler()
final_encoder = OneHotEncoder(sparse_output=False, handle_unknown='ignore')
scaler, encoder = final_scaler, final_encoder          # prepare() uses these names
X_all = prepare(df, fit=True)
final_model = DecisionTreeClassifier(random_state=42, class_weight='balanced')
final_model.fit(X_all, df[target])

# ------------------------------------------------------------
# 8. Save with joblib
# ------------------------------------------------------------
ranges = {col: (float(df[col].min()), float(df[col].max())) for col in num_features}
choices = {col: sorted(df[col].unique().tolist()) for col in cat_features}

joblib.dump({
    'model': final_model,
    'scaler': final_scaler,
    'encoder': final_encoder,
    'num_features': num_features,
    'cat_features': cat_features,
    'ranges': ranges,      # to warn about out-of-range inputs
    'choices': choices,    # valid values for each text column
}, 'irrigation_model.pkl', compress=3)

print("\nModel saved to irrigation_model.pkl")