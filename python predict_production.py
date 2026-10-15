import difflib
import joblib
import numpy as np
import pandas as pd
from scipy.sparse import hstack, csr_matrix

saved = joblib.load('crop_production_model.pkl')
model = saved['model']
scaler = saved['scaler']
encoder = saved['encoder']
num_features = saved['num_features']
cat_features = saved['cat_features']
options = saved['options']


def prepare(data):
    num_scaled = scaler.transform(data[num_features])
    cat_encoded = encoder.transform(data[cat_features])
    return hstack([csr_matrix(num_scaled), cat_encoded]).tocsr()


def match_name(value, valid_options, label):
    """Fix capital/small letters and small spelling mistakes."""
    value = str(value).strip()
    lookup = {opt.lower(): opt for opt in valid_options}
    if value.lower() in lookup:
        return lookup[value.lower()]
    close = difflib.get_close_matches(value.lower(), list(lookup), n=3, cutoff=0.75)
    if close:
        fixed = lookup[close[0]]
        print(f"Note: {label} '{value}' corrected to '{fixed}'")
        return fixed
    suggestions = difflib.get_close_matches(value.lower(), list(lookup), n=5, cutoff=0.4)
    hint = [lookup[s] for s in suggestions] or sorted(valid_options)[:10]
    raise ValueError(f"{label} '{value}' not found. Did you mean: {hint}")


def predict_production(state, district, season, crop, year, area):
    state = match_name(state, options['districts'].keys(), 'State')
    district = match_name(district, options['districts'][state], 'District')
    season = match_name(season, options['seasons'], 'Season')
    crop = match_name(crop, options['crops'][district], 'Crop')

    area = float(area)
    if area <= 0:
        raise ValueError("Area must be greater than 0")

    # the model has only seen these years; outside them it repeats the nearest year
    year = int(year)
    note = None
    if not options['year_min'] <= year <= options['year_max']:
        note = (f"Data covers {options['year_min']}-{options['year_max']}; "
                f"{year} is estimated using the nearest year's pattern.")
        year = min(max(year, options['year_min']), options['year_max'])

    new_data = pd.DataFrame([{
        'State_Name': state, 'District_Name': district, 'Crop_Year': year,
        'Season': season, 'Crop': crop,
    }])
    yield_per_ha = float(np.expm1(model.predict(prepare(new_data)))[0])

    return {
        'state': state, 'district': district, 'season': season, 'crop': crop,
        'area': area,
        'yield_per_ha': round(yield_per_ha, 3),
        'production': round(yield_per_ha * area, 2),   # works for ANY area
        'note': note,
    }


if __name__ == '__main__':
    import difflib
    import re

    # Short names people often type for states
    STATE_SHORT = {
        "up": "Uttar Pradesh", "mp": "Madhya Pradesh", "hp": "Himachal Pradesh",
        "ap": "Andhra Pradesh", "wb": "West Bengal", "tn": "Tamil Nadu",
        "jk": "Jammu and Kashmir", "j&k": "Jammu and Kashmir", "uk": "Uttarakhand",
        "bengal": "West Bengal", "orissa": "Odisha", "pondicherry": "Puducherry",
    }

    def smart_match(value, valid_options, label):
        """Turn whatever the user typed into a valid name. Never raises an error:
        fixes case, short forms and spelling, and asks the user to pick only when unsure."""
        valid_options = sorted(valid_options)
        lookup = {v.lower(): v for v in valid_options}
        text = value.strip().lower()

        # 1. exact (any case): 'deoria' -> 'DEORIA'
        if text in lookup:
            return lookup[text]

        # 2. short form: 'up' -> 'Uttar Pradesh'
        if label == "State" and STATE_SHORT.get(text) in valid_options:
            fixed = STATE_SHORT[text]
            print(f"   ✓ '{value}' → {fixed}")
            return fixed

        # 3. start of the name: 'lud' -> 'LUDHIANA'
        starts = [v for v in valid_options if v.lower().startswith(text)] if len(text) >= 3 else []
        if len(starts) == 1:
            print(f"   ✓ '{value}' → {starts[0]}")
            return starts[0]

        # 4. spelling: 'rce' -> 'Rice', 'deoriya' -> 'DEORIA'
        scored = sorted(((difflib.SequenceMatcher(None, text, k).ratio(), lookup[k]) for k in lookup),
                        reverse=True)
        best_score, best = scored[0]
        if best_score >= 0.8 and not starts:
            print(f"   ✓ '{value}' → {best}")
            return best

        # 5. not sure: show the closest names and let the user pick (Enter = first one)
        choices = starts[:5] or [name for score, name in scored[:5]]
        print(f"   '{value}' is not a {label.lower()} in the data. Did you mean:")
        for i, name in enumerate(choices, 1):
            print(f"     {i}. {name}")
        while True:
            pick = input(f"   Choose 1-{len(choices)} (Enter = 1, or type the name again): ").strip()
            if pick == "":
                return choices[0]
            if pick.isdigit() and 1 <= int(pick) <= len(choices):
                return choices[int(pick) - 1]
            return smart_match(pick, valid_options, label)

    def ask_name(label, valid_options):
        """Ask for a name. Empty or ? shows the list."""
        while True:
            value = input(f"{label}: ").strip()
            if value in ("", "?"):
                print("   " + ", ".join(sorted(valid_options)))
                continue
            return smart_match(value, valid_options, label)

    def ask_number(label, minimum, maximum=None):
        """Read a number even from text like '2.5 ha' or '1,000'. Asks again only if there is no number."""
        while True:
            text = input(f"{label}: ").replace(",", "")
            found = re.search(r"\d+(\.\d+)?", text)
            if found:
                value = float(found.group())
                if value >= minimum and (maximum is None or value <= maximum):
                    return value
            limit = f"between {minimum:g} and {maximum:g}" if maximum is not None else f"more than {minimum:g}"
            print(f"   Please enter a number {limit}.")

    print("=== AgriMind: crop production estimate ===")
    print("(Type ? to see the list of names. Spelling mistakes are fixed for you.)\n")
    while True:
        state = ask_name("State", options['districts'].keys())
        district = ask_name("District", options['districts'][state])
        crop = ask_name("Crop", options['crops'][district])
        season = ask_name("Season", options['seasons'])
        year = int(ask_number("Year", 1900, 2100))
        area = ask_number("Area in hectares", 0.01)

        try:
            r = predict_production(state=state, district=district, season=season,
                                   crop=crop, year=year, area=area)
            print(f"\n{r['crop']} in {r['district']}, {r['state']} ({r['season']}), {r['area']:g} ha")
            print(f"Expected yield:       {r['yield_per_ha']:.2f} tonnes/hectare")
            print(f"Predicted production: {r['production']:,.2f} tonnes")
            if r['note']:
                print("Note:", r['note'])
        except ValueError as e:
            print("Could not predict:", e)

        if input("\nPredict another? (y/n): ").strip().lower() not in ("y", "yes"):
            break