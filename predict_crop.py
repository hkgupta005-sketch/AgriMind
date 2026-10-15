import joblib
import numpy as np
import pandas as pd

# ------------------------------------------------------------
# Load the saved model (no training here)
# ------------------------------------------------------------
saved = joblib.load('crop_rec_model.pkl')
model = saved['model']
scaler = saved['scaler']
num_features = saved['num_features']
ranges = saved['ranges']

UNITS = {
    'N': 'soil ratio', 'P': 'soil ratio', 'K': 'soil ratio',
    'temperature': '°C', 'humidity': '%', 'ph': '0-14', 'rainfall': 'mm',
}
LOW_CONFIDENCE = 50   # below this %, the model is not sure


def recommend_crop(N, P, K, temperature, humidity, ph, rainfall, top=3):
    values = {'N': N, 'P': P, 'K': K, 'temperature': temperature,
              'humidity': humidity, 'ph': ph, 'rainfall': rainfall}

    # 1. check inputs are numbers and physically possible
    try:
        values = {k: float(v) for k, v in values.items()}
    except (TypeError, ValueError):
        raise ValueError("All inputs must be numbers")
    if not 0 <= values['ph'] <= 14:
        raise ValueError("pH must be between 0 and 14")
    if not 0 <= values['humidity'] <= 100:
        raise ValueError("Humidity must be between 0 and 100")
    if any(values[k] < 0 for k in ['N', 'P', 'K', 'rainfall']):
        raise ValueError("N, P, K and rainfall cannot be negative")

    # 2. warn if a value is outside what the model has seen
    warnings = []
    for col in num_features:
        lo, hi = ranges[col]
        if not lo <= values[col] <= hi:
            warnings.append(f"{col} = {values[col]} is outside the data range "
                            f"{lo:g}–{hi:g} {UNITS[col]}")

    # 3. predict
    new_data = pd.DataFrame([[values[c] for c in num_features]], columns=num_features)
    new_scaled = pd.DataFrame(scaler.transform(new_data), columns=num_features)

    probs = model.predict_proba(new_scaled)[0]
    top_idx = np.argsort(probs)[::-1][:top]
    top_crops = [(model.classes_[i], round(float(probs[i]) * 100, 1)) for i in top_idx]

    best_crop, best_pct = top_crops[0]
    if best_pct < LOW_CONFIDENCE:
        warnings.append(f"Low confidence ({best_pct}%): these soil/weather values "
                        "don't clearly match any single crop")

    return {'crop': best_crop, 'confidence': best_pct,
            'top': top_crops, 'warnings': warnings}


def show(result):
    print(f"\nRecommended crop: {result['crop']} ({result['confidence']}%)")
    for name, pct in result['top']:
        print(f"  {name:<12} {pct}%")
    for w in result['warnings']:
        print("  ⚠", w)


if __name__ == '__main__':
    import re

    # (key, question, unit, smallest possible, largest possible)
    QUESTIONS = [
        ("N", "Nitrogen (N)", "soil test ratio", 0, None),
        ("P", "Phosphorus (P)", "soil test ratio", 0, None),
        ("K", "Potassium (K)", "soil test ratio", 0, None),
        ("temperature", "Temperature", "°C", -10, 60),
        ("humidity", "Humidity", "%", 0, 100),
        ("ph", "Soil pH", "0-14", 0, 14),
        ("rainfall", "Rainfall", "mm", 0, None),
    ]

    # Typical value for each field (median of the dataset), used when the user presses Enter
    try:
        data = pd.read_csv('crop_rec.csv')
        data.columns = data.columns.str.strip()
        TYPICAL = {k: round(float(data[k].median()), 1) for k, *_ in QUESTIONS}
    except (FileNotFoundError, KeyError):
        TYPICAL = {k: round(sum(ranges[k]) / 2, 1) for k, *_ in QUESTIONS}

    def ask_number(key, question, unit, low, high):
        """Read a number even from text like '25 mm' or '6,5'. Enter = typical value."""
        lo, hi = ranges[key]
        while True:
            text = input(f"{question} [{unit}] (data: {round(lo, 1):g}-{round(hi, 1):g}, Enter = {TYPICAL[key]:g}): ").strip()
            if text == "":
                print(f"   using typical value {TYPICAL[key]:g}")
                return TYPICAL[key]
            text = text.replace(",", ".") if text.count(",") == 1 and "." not in text else text.replace(",", "")
            found = re.search(r"-?\d+(\.\d+)?", text)
            if found:
                value = float(found.group())
                if value >= low and (high is None or value <= high):
                    return value
            limit = f"between {low:g} and {high:g}" if high is not None else f"{low:g} or more"
            print(f"   Please enter a number {limit}.")

    print("=== AgriMind: which crop should I grow? ===")
    print("(Press Enter on any question if you don't know it; a typical value is used.)\n")
    while True:
        values = {key: ask_number(key, q, unit, low, high) for key, q, unit, low, high in QUESTIONS}
        try:
            show(recommend_crop(**values))
        except ValueError as e:
            print("Could not predict:", e)

        if input("\nCheck another field? (y/n): ").strip().lower() not in ("y", "yes"):
            break