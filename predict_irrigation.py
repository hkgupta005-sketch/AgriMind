import difflib
import joblib
import pandas as pd

# ------------------------------------------------------------
# Load the saved model (no training here)
# ------------------------------------------------------------
saved = joblib.load('irrigation_model.pkl')
model = saved['model']
scaler = saved['scaler']
encoder = saved['encoder']
num_features = saved['num_features']
cat_features = saved['cat_features']
ranges = saved['ranges']
choices = saved['choices']

UNITS = {
    'Soil_pH': '0-14', 'Soil_Moisture': '%', 'Organic_Carbon': '%',
    'Electrical_Conductivity': 'dS/m', 'Temperature_C': '°C', 'Humidity': '%',
    'Rainfall_mm': 'mm', 'Sunlight_Hours': 'hours/day', 'Wind_Speed_kmh': 'km/h',
    'Field_Area_hectare': 'hectares', 'Previous_Irrigation_mm': 'mm',
}

ADVICE = {
    'Low': 'Soil has enough water. Irrigation can wait; check again in a few days.',
    'Medium': 'Plan a normal irrigation soon.',
    'High': 'Irrigate as soon as possible; the crop is at risk of water stress.',
}


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
    raise ValueError(f"{label} '{value}' not valid. Choose from: {sorted(valid_options)}")


def prepare(data):
    """Same steps as training (only transform, never fit)."""
    num_df = pd.DataFrame(scaler.transform(data[num_features]), columns=num_features)
    cat_df = pd.DataFrame(encoder.transform(data[cat_features]),
                          columns=encoder.get_feature_names_out(cat_features))
    return pd.concat([num_df, cat_df], axis=1)


def predict_irrigation(**field):
    # 1. every column must be given
    missing = [c for c in num_features + cat_features if c not in field]
    if missing:
        raise ValueError(f"Missing inputs: {missing}")

    # 2. text columns: fix case/spelling
    for col in cat_features:
        field[col] = match_name(field[col], choices[col], col)

    # 3. numeric columns: must be numbers and physically possible
    for col in num_features:
        try:
            field[col] = float(field[col])
        except (TypeError, ValueError):
            raise ValueError(f"{col} must be a number")
    if not 0 <= field['Soil_pH'] <= 14:
        raise ValueError("Soil_pH must be between 0 and 14")
    for col in ['Humidity', 'Soil_Moisture']:
        if not 0 <= field[col] <= 100:
            raise ValueError(f"{col} must be between 0 and 100")
    if not 0 <= field['Sunlight_Hours'] <= 24:
        raise ValueError("Sunlight_Hours must be between 0 and 24")
    for col in ['Organic_Carbon', 'Electrical_Conductivity', 'Rainfall_mm',
                'Wind_Speed_kmh', 'Field_Area_hectare', 'Previous_Irrigation_mm']:
        if field[col] < 0:
            raise ValueError(f"{col} cannot be negative")

    # 4. warn if outside what the model has seen (trees can't extrapolate)
    warnings = []
    for col in num_features:
        lo, hi = ranges[col]
        if not lo <= field[col] <= hi:
            warnings.append(f"{col} = {field[col]:g} is outside the data range "
                            f"{lo:g}–{hi:g} {UNITS[col]}")

    # 5. predict
    need = model.predict(prepare(pd.DataFrame([field])))[0]
    return {'need': need, 'advice': ADVICE.get(need, ''), 'warnings': warnings}


def show(r):
    print(f"\nIrrigation need: {r['need']}")
    print(f"Advice: {r['advice']}")
    for w in r['warnings']:
        print("  ⚠", w)


if __name__ == '__main__':
    import re

    # ------------------------------------------------------------
    # Typical values from the dataset. Simple answers like "dry" or
    # "windy" are turned into numbers using these, so the farmer never
    # needs to know exact measurements.
    # ------------------------------------------------------------
    try:
        data = pd.read_csv('irrigation_prediction.csv')
        data.columns = data.columns.str.strip()
    except FileNotFoundError:
        data = None

    def level(col, q):
        """Value at a given position in the data (q=0.1 low ... 0.9 high)."""
        if data is not None:
            return round(float(data[col].quantile(q)), 1)
        lo, hi = ranges[col]
        return round(lo + (hi - lo) * q, 1)

    def typical(col):
        if col in cat_features:
            return str(data[col].mode()[0]).strip().title() if data is not None else choices[col][0]
        return level(col, 0.5)

    # States -> the 5 regions used by the model
    STATE_REGION = {
        'North': ['punjab', 'haryana', 'himachal', 'jammu', 'kashmir', 'ladakh', 'uttarakhand',
                  'uttar pradesh', 'up', 'delhi', 'chandigarh'],
        'East': ['bihar', 'jharkhand', 'west bengal', 'bengal', 'odisha', 'orissa', 'assam',
                 'sikkim', 'arunachal', 'nagaland', 'manipur', 'mizoram', 'tripura',
                 'meghalaya', 'north east', 'north-east', 'northeast'],
        'West': ['rajasthan', 'gujarat', 'maharashtra', 'goa'],
        'South': ['karnataka', 'kerala', 'tamil nadu', 'andhra', 'telangana', 'puducherry'],
        'Central': ['madhya pradesh', 'mp', 'chhattisgarh'],
    }

    def ask_menu(question, help_text, options, default, value_range=None):
        """Show a numbered menu with a short explanation for each option.
        The user can type the number, or the name (spelling is fixed). Enter = default.
        value_range=(low, high): also accept a measured value typed directly (e.g. 42 for 42%)."""
        print(f"\n{question}")
        if help_text:
            print(f"   {help_text}")
        for i, (label, explain, _) in enumerate(options, 1):
            mark = "  ← default" if i == default else ""
            print(f"   {i}. {label:<14} {explain}{mark}")
        labels = [label for label, _, _ in options]
        while True:
            text = input(f"   Your answer (1-{len(options)}, Enter = {default}): ").strip()
            if text == "":
                return options[default - 1][2]
            if text.isdigit() and 1 <= int(text) <= len(options):
                return options[int(text) - 1][2]
            found = re.search(r"\d+(\.\d+)?", text)
            if value_range and found and value_range[0] <= float(found.group()) <= value_range[1]:
                return float(found.group())            # a measured value like '42%'
            try:
                picked = match_name(text, labels, question.split('?')[0])
                return options[labels.index(picked)][2]
            except ValueError:
                print(f"   Please type a number from 1 to {len(options)}.")

    def ask_yes_no(question, help_text, default="No"):
        print(f"\n{question}")
        if help_text:
            print(f"   {help_text}")
        while True:
            text = input(f"   Yes or No (Enter = {default}): ").strip().lower()
            if text == "":
                return default
            if text in ("y", "yes", "haan", "ha", "han", "1"):
                return "Yes"
            if text in ("n", "no", "nahi", "nhi", "na", "0", "2"):
                return "No"
            print("   Please type yes or no.")

    def ask_number(question, help_text, col, low, high=None):
        """A number, even typed like '38 C'. Enter = typical value."""
        print(f"\n{question}")
        if help_text:
            print(f"   {help_text}")
        while True:
            text = input(f"   Your answer (Enter = {typical(col):g}): ").strip()
            if text == "":
                return typical(col)
            text = text.replace(",", ".") if text.count(",") == 1 and "." not in text else text.replace(",", "")
            found = re.search(r"-?\d+(\.\d+)?", text)
            if found:
                value = float(found.group())
                if value >= low and (high is None or value <= high):
                    return value
            limit = f"between {low:g} and {high:g}" if high is not None else f"{low:g} or more"
            print(f"   Please enter a number {limit}.")

    def ask_region():
        print("\nWhich state is your farm in?")
        print("   Type your state name (e.g. Punjab, Bihar, Kerala). Enter = skip.")
        while True:
            text = input("   State: ").strip().lower()
            if text == "":
                return typical('Region')
            for region, states in STATE_REGION.items():
                if any(text == s or (len(text) > 3 and s.startswith(text)) for s in states):
                    print(f"   → {region} India")
                    return region
            try:
                return match_name(text, choices['Region'], 'Region')     # also accepts north/south/...
            except ValueError:
                print("   State not recognised. Type the state name or North / South / East / West / Central.")

    # ------------------------------------------------------------
    # The questions
    # ------------------------------------------------------------
    def quick_questions():
        f = {}
        f['Crop_Type'] = ask_menu(
            "1) Which crop is in the field?", "",
            [(c, "", c) for c in choices['Crop_Type']],
            choices['Crop_Type'].index(typical('Crop_Type')) + 1)

        f['Crop_Growth_Stage'] = ask_menu(
            "2) What stage is the crop at?", "",
            [("Sowing", "seeds just planted / small seedlings", "Sowing"),
             ("Vegetative", "plant is growing, leaves increasing", "Vegetative"),
             ("Flowering", "flowers or grains forming", "Flowering"),
             ("Harvest", "crop is ready or nearly ready to cut", "Harvest")], 2)

        f['Season'] = ask_menu(
            "3) Which season is it?", "",
            [("Kharif", "monsoon crop, sown June–July", "Kharif"),
             ("Rabi", "winter crop, sown Oct–Nov", "Rabi"),
             ("Zaid", "summer crop, sown March–April", "Zaid")], 1)

        f['Soil_Moisture'] = ask_menu(
            "4) How does the soil feel? Pick up a handful from 5–10 cm deep.",
            "If you have a moisture meter, you can type the % reading instead.",
            [("Very dry", "dusty, cracked, falls apart", level('Soil_Moisture', 0.1)),
             ("Dry", "crumbles, doesn't hold shape", level('Soil_Moisture', 0.3)),
             ("Slightly moist", "holds shape a little, then breaks", level('Soil_Moisture', 0.5)),
             ("Moist", "forms a ball, feels cool", level('Soil_Moisture', 0.7)),
             ("Wet / muddy", "sticky, water comes out when squeezed", level('Soil_Moisture', 0.9))], 3,
            value_range=(6, 100))

        f['Temperature_C'] = ask_number(
            "5) What is today's temperature (°C)?",
            "Check the weather app on your phone. Example: 35",
            'Temperature_C', -10, 60)

        f['Rainfall_mm'] = ask_menu(
            "6) How much rain has there been this season?", "",
            [("Very little", "almost no rain", level('Rainfall_mm', 0.1)),
             ("Below normal", "less rain than usual", level('Rainfall_mm', 0.3)),
             ("Normal", "usual rain", level('Rainfall_mm', 0.5)),
             ("Good", "more rain than usual", level('Rainfall_mm', 0.7)),
             ("Heavy", "very heavy rain / flooding", level('Rainfall_mm', 0.9))], 3)

        f['Wind_Speed_kmh'] = ask_menu(
            "7) How windy is it these days?",
            "Wind dries the soil faster.",
            [("Calm", "leaves hardly move", level('Wind_Speed_kmh', 0.1)),
             ("Light breeze", "leaves move gently", level('Wind_Speed_kmh', 0.3)),
             ("Breezy", "small branches move", level('Wind_Speed_kmh', 0.5)),
             ("Windy", "dust blows, branches sway", level('Wind_Speed_kmh', 0.9))], 3)

        f['Mulching_Used'] = ask_yes_no(
            "8) Is the soil covered with mulch?",
            "Mulch = straw, dry leaves or plastic sheet spread on the soil to keep water in.")
        return f

    def detailed_questions(f):
        f['Region'] = ask_region()
        f['Soil_Type'] = ask_menu(
            "Soil type?", "",
            [("Clay", "sticky and heavy when wet, cracks when dry", "Clay"),
             ("Loamy", "soft, dark, crumbly (good farm soil)", "Loamy"),
             ("Sandy", "gritty, water drains very fast", "Sandy"),
             ("Silt", "smooth and silky, like flour", "Silt")],
            choices['Soil_Type'].index(typical('Soil_Type')) + 1)
        f['Irrigation_Type'] = ask_menu(
            "How do you water the field?", "",
            [("Canal", "water flows in channels / flooding", "Canal"),
             ("Drip", "pipes with drops at each plant", "Drip"),
             ("Sprinkler", "water sprayed from above", "Sprinkler"),
             ("Rainfed", "only rain, no irrigation", "Rainfed")], 1)
        f['Water_Source'] = ask_menu(
            "Where does the water come from?", "",
            [("Groundwater", "borewell / tubewell / well", "Groundwater"),
             ("River", "river or canal", "River"),
             ("Reservoir", "pond, tank or dam", "Reservoir"),
             ("Rainwater", "stored rainwater", "Rainwater")], 1)
        f['Humidity'] = ask_menu(
            "How humid is the air?", "",
            [("Dry air", "skin and lips feel dry", level('Humidity', 0.1)),
             ("Normal", "", level('Humidity', 0.5)),
             ("Humid / sticky", "sweaty, muggy air", level('Humidity', 0.9))], 2)
        f['Sunlight_Hours'] = ask_number(
            "About how many hours of sunshine per day?", "Example: 8", 'Sunlight_Hours', 0, 24)
        f['Field_Area_hectare'] = ask_number(
            "Field size in hectares?", "1 hectare = 2.5 acres (about 4 bigha in many states).",
            'Field_Area_hectare', 0.01)
        f['Previous_Irrigation_mm'] = ask_menu(
            "How much water was given last time?", "",
            [("Very little", "light watering", level('Previous_Irrigation_mm', 0.1)),
             ("Normal", "usual watering", level('Previous_Irrigation_mm', 0.5)),
             ("A lot", "field was fully flooded", level('Previous_Irrigation_mm', 0.9))], 2)
        print("\nThe next 3 are on your Soil Health Card (मृदा स्वास्थ्य कार्ड). Press Enter if you don't have it.")
        f['Soil_pH'] = ask_number("Soil pH?", "Usually between 5 and 8.", 'Soil_pH', 0, 14)
        f['Organic_Carbon'] = ask_number("Organic carbon (OC, %)?", "Usually 0.3 to 1.5.", 'Organic_Carbon', 0)
        f['Electrical_Conductivity'] = ask_number("Electrical conductivity (EC, dS/m)?",
                                                  "Usually 0.1 to 3.5.", 'Electrical_Conductivity', 0)
        return f

    # ------------------------------------------------------------
    # Run
    # ------------------------------------------------------------
    print("=" * 60)
    print("  AgriMind: does my field need water today?")
    print("=" * 60)
    print("Answer 8 simple questions. Press Enter if you are not sure.")

    while True:
        field = quick_questions()

        more = ask_yes_no("Do you want to answer more questions for a better result?",
                          "Soil type, water source, field size, soil test values… (about 2 minutes)")
        if more == "Yes":
            field = detailed_questions(field)

        # anything not asked = typical value from the data
        for col in num_features + cat_features:
            field.setdefault(col, typical(col))

        try:
            show(predict_irrigation(**field))
        except ValueError as e:
            print("Could not predict:", e)

        if ask_yes_no("Check another field?", "") != "Yes":
            break