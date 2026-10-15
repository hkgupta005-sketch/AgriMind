import joblib
import pandas as pd
import numpy as np
from sklearn.model_selection import StratifiedShuffleSplit, cross_val_score
from sklearn.preprocessing import OneHotEncoder
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error, r2_score

# ------------------------------------------------------------
# 1. Load
# ------------------------------------------------------------
df = pd.read_csv('daily_price.csv')
print("Original shape:", df.shape)

# ------------------------------------------------------------
# 2. Clean the data
# ------------------------------------------------------------
df.columns = df.columns.str.strip()
cat_features = ['State', 'District', 'Market', 'Commodity', 'Variety', 'Grade']
price_cols = ['Min Price', 'Max Price', 'Modal Price']

for col in cat_features:
    df[col] = df[col].astype(str).str.strip()
for col in price_cols:
    df[col] = pd.to_numeric(df[col], errors='coerce')

df = df.dropna()
df = df.drop_duplicates()

# prices must be positive
df = df[(df[price_cols] > 0).all(axis=1)]

# if Min > Max, swap them
swap = df['Min Price'] > df['Max Price']
df.loc[swap, ['Min Price', 'Max Price']] = df.loc[swap, ['Max Price', 'Min Price']].values

# Modal Price must lie between Min and Max
df = df[(df['Modal Price'] >= df['Min Price']) & (df['Modal Price'] <= df['Max Price'])]
df = df.reset_index(drop=True)
print("Shape after cleaning:", df.shape)

# ------------------------------------------------------------
# 3. Stratified split on price category
# ------------------------------------------------------------
df['price_category'] = pd.cut(
    df['Modal Price'],
    bins=[0, 1000, 2000, 3000, 5000, 10000, np.inf],
    labels=['Very Low', 'Low', 'Medium', 'High', 'Very High', 'Extremely High'],
    include_lowest=True
)

split = StratifiedShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
for train_index, test_index in split.split(df, df['price_category']):
    train_set = df.iloc[train_index]
    test_set = df.iloc[test_index]

# Min/Max Price are NOT features (recorded together with Modal Price = cheating)
y_train = np.log1p(train_set['Modal Price'].values)   # prices are very skewed
y_test = np.log1p(test_set['Modal Price'].values)

# ------------------------------------------------------------
# 4. One-hot encode (all features are categorical, no scaling needed)
# ------------------------------------------------------------
encoder = OneHotEncoder(handle_unknown='ignore', sparse_output=True)
X_train = encoder.fit_transform(train_set[cat_features])
X_test = encoder.transform(test_set[cat_features])
print("Encoded train shape:", X_train.shape)

# ------------------------------------------------------------
# 5. Cross-validation (Random Forest was the best model)
# ------------------------------------------------------------
model = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
rmses = -cross_val_score(model, X_train, y_train,
                         scoring='neg_root_mean_squared_error', cv=10, n_jobs=-1)
print(f"\nRandom Forest CV RMSE (log price): {rmses.mean():.4f} (± {rmses.std():.4f})")

# ------------------------------------------------------------
# 6. Final check on the test set
# ------------------------------------------------------------
model.fit(X_train, y_train)
pred_log = model.predict(X_test)

rmse_log = np.sqrt(mean_squared_error(y_test, pred_log))
print("Test RMSE (log price):", round(rmse_log, 4),
      f"-> predictions usually within about ±{(np.exp(rmse_log) - 1) * 100:.0f}%")
print("Test R2 (log price):", round(r2_score(y_test, pred_log), 4))

compare = pd.DataFrame({
    'Commodity': test_set['Commodity'].values,
    'Actual (Rs/qtl)': np.expm1(y_test).round(0),
    'Predicted (Rs/qtl)': np.expm1(pred_log).round(0),
})
print(compare.head(10))

# ------------------------------------------------------------
# 7. Final model for the website: retrain on ALL data
#    (the test score above is the score we report)
# ------------------------------------------------------------
final_encoder = OneHotEncoder(handle_unknown='ignore', sparse_output=True)
X_all = final_encoder.fit_transform(df[cat_features])
final_model = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
final_model.fit(X_all, np.log1p(df['Modal Price'].values))

# ------------------------------------------------------------
# 8. Save with joblib
# ------------------------------------------------------------
options = {
    'districts': {s: sorted(g['District'].unique().tolist()) for s, g in df.groupby('State')},
    'markets': {d: sorted(g['Market'].unique().tolist()) for d, g in df.groupby('District')},
    'commodities': sorted(df['Commodity'].unique().tolist()),
    'market_commodities': {m: sorted(g['Commodity'].unique().tolist())
                           for m, g in df.groupby('Market')},
    'varieties': {c: sorted(g['Variety'].unique().tolist()) for c, g in df.groupby('Commodity')},
    'grades': sorted(df['Grade'].unique().tolist()),
    'commodity_rows': df['Commodity'].value_counts().to_dict(),   # how much data per commodity
}

joblib.dump({
    'model': final_model,
    'encoder': final_encoder,
    'cat_features': cat_features,
    'options': options,
    'test_rmse_log': float(rmse_log),
}, 'daily_price_model.pkl', compress=3)

print("\nModel saved to daily_price_model.pkl")