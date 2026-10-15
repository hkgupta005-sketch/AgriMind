import difflib
import joblib
import numpy as np
import pandas as pd

# ------------------------------------------------------------
# Load the saved model (no training here)
# ------------------------------------------------------------
saved = joblib.load('daily_price_model.pkl')
model = saved['model']
encoder = saved['encoder']
cat_features = saved['cat_features']
options = saved['options']
error_pct = (np.exp(saved['test_rmse_log']) - 1) * 100   # typical error, from the test set

MIN_ROWS = 10   # commodities with fewer rows than this give unreliable predictions


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


def predict_price(state, district, market, commodity, variety='Other', grade='FAQ'):
    state = match_name(state, options['districts'].keys(), 'State')
    district = match_name(district, options['districts'][state], 'District')
    market = match_name(market, options['markets'][district], 'Market')
    commodity = match_name(commodity, options['commodities'], 'Commodity')
    variety = match_name(variety, options['varieties'][commodity], 'Variety')
    grade = match_name(grade, options['grades'], 'Grade')

    warnings = []
    if commodity not in options['market_commodities'].get(market, []):
        warnings.append(f"{commodity} was not traded in {market} in the data; "
                        "price is estimated from other markets")
    rows = options['commodity_rows'].get(commodity, 0)
    if rows < MIN_ROWS:
        warnings.append(f"Only {rows} records for {commodity}; this prediction is unreliable")

    new_data = pd.DataFrame([[state, district, market, commodity, variety, grade]],
                            columns=cat_features)
    price = float(np.expm1(model.predict(encoder.transform(new_data)))[0])

    return {
        'state': state, 'district': district, 'market': market,
        'commodity': commodity, 'variety': variety, 'grade': grade,
        'price_per_quintal': round(price, 2),
        'price_per_kg': round(price / 100, 2),
        'range_low': round(price / (1 + error_pct / 100), 0),
        'range_high': round(price * (1 + error_pct / 100), 0),
        'warnings': warnings,
    }


def show(r):
    print(f"\n{r['commodity']} ({r['variety']}, {r['grade']}) at {r['market']}, "
          f"{r['district']}, {r['state']}")
    print(f"Predicted Modal Price: Rs {r['price_per_quintal']:,.0f} per quintal "
          f"(≈ Rs {r['price_per_kg']:,.2f} per kg)")
    print(f"Likely range: Rs {r['range_low']:,.0f} – Rs {r['range_high']:,.0f} per quintal")
    for w in r['warnings']:
        print("  ⚠", w)


if __name__ == '__main__':
    import re

    # Everyday / Hindi names -> names used in the mandi data
    COMMON_NAMES = {
        'aloo': 'Potato', 'alu': 'Potato', 'pyaz': 'Onion', 'pyaj': 'Onion', 'kanda': 'Onion',
        'tamatar': 'Tomato', 'gehun': 'Wheat', 'gehu': 'Wheat', 'dhan': 'Paddy(Dhan)(Common)',
        'paddy': 'Paddy(Dhan)(Common)', 'makka': 'Maize', 'makai': 'Maize', 'sarson': 'Mustard',
        'sarso': 'Mustard', 'chana': 'Bengal Gram(Gram)(Whole)', 'baingan': 'Brinjal',
        'gobhi': 'Cauliflower', 'phool gobhi': 'Cauliflower', 'patta gobhi': 'Cabbage',
        'mirch': 'Green Chilli', 'hari mirch': 'Green Chilli', 'lehsun': 'Garlic', 'lahsun': 'Garlic',
        'adrak': 'Ginger(Green)', 'kela': 'Banana', 'aam': 'Mango', 'nimbu': 'Lemon',
        'kapas': 'Cotton', 'lauki': 'Bottle gourd', 'karela': 'Bitter gourd', 'gajar': 'Carrot',
        'mooli': 'Raddish', 'matar': 'Peas Wet', 'palak': 'Spinach', 'seb': 'Apple',
    }
    STATE_SHORT = {'up': 'Uttar Pradesh', 'mp': 'Madhya Pradesh', 'hp': 'Himachal Pradesh',
                   'ap': 'Andhra Pradesh', 'wb': 'West Bengal', 'tn': 'Tamil Nadu',
                   'jk': 'Jammu and Kashmir', 'uk': 'Uttarakhand', 'orissa': 'Odisha'}

    def find(text, valid, aliases=None):
        """All names that could be what the user meant, best first."""
        valid = list(valid)
        low = {v.lower(): v for v in valid}
        t = text.strip().lower()
        if t in low:
            return [low[t]]
        if aliases and aliases.get(t) in valid:
            return [aliases[t]]
        if len(t) >= 3:
            starts = [v for v in valid if v.lower().startswith(t)]
            if starts:
                return starts
            inside = [v for v in valid if t in v.lower()]       # 'dhan' -> 'Paddy(Dhan)(Common)'
            if inside:
                return inside
        # spelling mistakes: if one name is clearly the closest, take it
        scored = sorted(((difflib.SequenceMatcher(None, t, k).ratio(), low[k]) for k in low), reverse=True)
        if scored and scored[0][0] >= 0.8 and (len(scored) == 1 or scored[0][0] - scored[1][0] >= 0.1):
            return [scored[0][1]]
        return [name for score, name in scored[:5] if score >= 0.6]

    def numbered(items):
        for i, item in enumerate(items, 1):
            print(f"   {i:>2}. {item}")

    def pick(question, valid, hint="", default=None, list_if_up_to=20, aliases=None):
        """Ask for a name. Shows a numbered list when it is short.
        Accepts the number, the name, a Hindi/common name, part of the name or a misspelling."""
        valid = sorted(valid)
        if len(valid) == 1:                        # only one possible answer: no need to ask
            print(f"\n{question} → {valid[0]} (only one in the data)")
            return valid[0]
        print(f"\n{question}")
        if hint:
            print(f"   {hint}")
        shown = valid if len(valid) <= list_if_up_to else None
        if shown:
            numbered(shown)
        while True:
            enter = f"Enter = {default}" if default else "Enter = show list"
            text = input(f"   Your answer ({enter}): ").strip()
            if text == "":
                if default:
                    return default
                shown = valid
                numbered(shown)
                continue
            if text.isdigit() and shown and 1 <= int(text) <= len(shown):
                return shown[int(text) - 1]
            found = find(text, valid, aliases)
            if len(found) == 1:
                if found[0].lower() != text.lower():
                    print(f"   ✓ {found[0]}")
                return found[0]
            if found:                                # several possible answers -> let the user choose
                shown = found[:10]
                print(f"   Which one do you mean?")
                numbered(shown)
                continue
            print("   Not found. Press Enter to see the list, or try another spelling.")

    print("=" * 60)
    print("  AgriMind: what price will my crop get at the mandi?")
    print("=" * 60)
    print("You can type names in Hindi or English (aloo, pyaz, gehun...).")
    print("Spelling mistakes are fixed. Type a number to pick from a list.")

    while True:
        state = pick("1) Which state?", options['districts'].keys(),
                     "Type the state name, e.g. Uttar Pradesh or UP", aliases={
                         k: v for k, v in STATE_SHORT.items()})
        district = pick("2) Which district?", options['districts'][state])
        market = pick("3) Which mandi (market)?", options['markets'][district],
                      "The market where you will sell.")

        traded_here = sorted(options['market_commodities'].get(market, []))
        commodity = pick(
            "4) Which crop do you want to sell?", options['commodities'],
            "Crops sold at this mandi are listed. You can also type any other crop name.",
            list_if_up_to=0, aliases=COMMON_NAMES) if not traded_here else None
        if traded_here:
            print("\n4) Which crop do you want to sell?")
            print("   Crops sold at this mandi:")
            numbered(traded_here)
            print("   (Or type any other crop name: aloo, wheat, onion...)")
            while commodity is None:
                text = input("   Your answer: ").strip()
                if text.isdigit() and 1 <= int(text) <= len(traded_here):
                    commodity = traded_here[int(text) - 1]
                elif text:
                    found = find(text, options['commodities'], COMMON_NAMES)
                    if len(found) == 1:
                        commodity = found[0]
                        print(f"   ✓ {commodity}")
                    elif found:
                        commodity = pick("   Which one do you mean?", found)
                    else:
                        print("   Not found. Try another name, e.g. aloo, onion, wheat.")

        varieties = options['varieties'].get(commodity, ['Other'])
        variety = pick("5) Which variety?", varieties,
                       "Press Enter if you don't know.",
                       default='Other' if 'Other' in varieties else varieties[0])

        print("\n6) Quality / size of your produce?")
        grade_info = [("FAQ", "normal, average quality (most common)"),
                      ("Large", "big size, top quality"),
                      ("Medium", "medium size"),
                      ("Small", "small size")]
        grade_info = [(g, d) for g, d in grade_info if g in options['grades']]
        for i, (g, d) in enumerate(grade_info, 1):
            print(f"   {i}. {g:<7} {d}")
        grade = None
        while grade is None:
            text = input("   Your answer (Enter = FAQ): ").strip()
            if text == "":
                grade = 'FAQ'
            elif text.isdigit() and 1 <= int(text) <= len(grade_info):
                grade = grade_info[int(text) - 1][0]
            else:
                found = find(text, [g for g, _ in grade_info], {'normal': 'FAQ', 'average': 'FAQ',
                                                                 'big': 'Large', 'bada': 'Large',
                                                                 'chhota': 'Small'})
                grade = found[0] if found else None
                if grade is None:
                    print(f"   Please type a number from 1 to {len(grade_info)}.")

        try:
            show(predict_price(state, district, market, commodity, variety, grade))
        except ValueError as e:
            print("Could not predict:", e)

        if input("\nCheck another price? (y/n): ").strip().lower() not in ("y", "yes", "haan"):
            break