import joblib
import pandas as pd
import numpy as np
from sklearn.model_selection import StratifiedShuffleSplit, cross_val_score
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error, r2_score
from scipy.sparse import hstack, csr_matrix

# ------------------------------------------------------------
# 1. Load + clean
# ------------------------------------------------------------
df = pd.read_csv('crop_production.csv')
df.columns = df.columns.str.strip()

cat_features = ['State_Name', 'District_Name', 'Season', 'Crop']
num_features = ['Crop_Year']          # Area is NOT a feature any more

for col in cat_features:
    df[col] = df[col].astype(str).str.strip()

df = df.dropna()
df = df.drop_duplicates()
df = df[(df['Area'] > 0) & (df['Production'] >= 0)]

# ------------------------------------------------------------
# 2. NEW TARGET: yield = production per hectare
#    Yield does not depend on field size, so the model works for
#    a 2 ha farm as well as a 50,000 ha district.
# ------------------------------------------------------------
df['Yield'] = df['Production'] / df['Area']

# remove data-entry errors: extreme yields within each crop
low = df.groupby('Crop')['Yield'].transform(lambda s: s.quantile(0.01))
high = df.groupby('Crop')['Yield'].transform(lambda s: s.quantile(0.99))
df = df[(df['Yield'] >= low) & (df['Yield'] <= high)]
df = df.reset_index(drop=True)
print("Shape after cleaning:", df.shape)

# ------------------------------------------------------------
# 3. Stratified split on yield level
# ------------------------------------------------------------
df['yield_category'] = pd.qcut(df['Yield'].rank(method='first'), q=5, labels=False)

split = StratifiedShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
for train_index, test_index in split.split(df, df['yield_category']):
    train_set = df.iloc[train_index]
    test_set = df.iloc[test_index]

y_train = np.log1p(train_set['Yield'].values)
y_test = np.log1p(test_set['Yield'].values)

# ------------------------------------------------------------
# 4. Prepare features
# ------------------------------------------------------------
scaler = StandardScaler()
encoder = OneHotEncoder(handle_unknown='ignore', sparse_output=True)

def prepare(data, fit=False):
    if fit:
        num_scaled = scaler.fit_transform(data[num_features])
        cat_encoded = encoder.fit_transform(data[cat_features])
    else:
        num_scaled = scaler.transform(data[num_features])
        cat_encoded = encoder.transform(data[cat_features])
    return hstack([csr_matrix(num_scaled), cat_encoded]).tocsr()

X_train = prepare(train_set, fit=True)
X_test = prepare(test_set)
print("Train shape:", X_train.shape)

# ------------------------------------------------------------
# 5. Train + evaluate
# ------------------------------------------------------------
model = RandomForestRegressor(n_estimators=50, max_depth=25, min_samples_leaf=5,
                              random_state=42, n_jobs=-1)

rmses = -cross_val_score(model, X_train, y_train,
                         scoring='neg_root_mean_squared_error', cv=5)
print("\nCV RMSE (log yield):")
print(pd.Series(rmses).describe())

model.fit(X_train, y_train)
pred_log = model.predict(X_test)
print("\nTest RMSE (log yield):", round(np.sqrt(mean_squared_error(y_test, pred_log)), 4))
print("Test R2 (log yield):", round(r2_score(y_test, pred_log), 4))

compare = pd.DataFrame({
    'Crop': test_set['Crop'].values,
    'Actual yield (t/ha)': np.expm1(y_test).round(2),
    'Predicted yield (t/ha)': np.expm1(pred_log).round(2),
})
print(compare.head(10))

# ------------------------------------------------------------
# 6. Save
# ------------------------------------------------------------
options = {
    'districts': {s: sorted(g['District_Name'].unique().tolist())
                  for s, g in df.groupby('State_Name')},
    'crops': {d: sorted(g['Crop'].unique().tolist())
              for d, g in df.groupby('District_Name')},
    'seasons': sorted(df['Season'].unique().tolist()),
    'year_min': int(df['Crop_Year'].min()),
    'year_max': int(df['Crop_Year'].max()),
}

joblib.dump({
    'model': model,
    'scaler': scaler,
    'encoder': encoder,
    'num_features': num_features,
    'cat_features': cat_features,
    'options': options,
}, 'crop_production_model.pkl', compress=3)
print("\nModel saved to crop_production_model.pkl")