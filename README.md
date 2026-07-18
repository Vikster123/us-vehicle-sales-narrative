# Ten Years on the American Road

An interactive narrative visualization built with **D3.js only**, using the Kaggle **US Vehicle Sales by Model** dataset.

## Narrative structure

This project uses an **interactive slideshow** with three scenes:

1. **The market:** annual sales represented by all rows in the dataset and the steepest year-over-year decline.
2. **The leaders:** seven named vehicle models with the greatest cumulative sales.
3. **Explore:** a brand dropdown, model checkboxes, and hover tooltips.

The real Kaggle CSV is already included at:

```text
data/us_car_model_sales_2013_2022.csv
```

The JavaScript reads `Maker/Brand` as the manufacturer and `Maker_Brand` as the full make/model label. It automatically detects the annual columns from 2013 through 2022. Aggregate rows labeled `Total` or `Unclassified` contribute to the overall market scene but are excluded from model rankings and the brand explorer.

## Run locally

Because D3 loads the CSV with `fetch`, open the project through a local web server rather than double-clicking `index.html`.

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Publish with GitHub Pages

1. Create a new public GitHub repository.
2. Upload every file and folder in this project.
3. Open the repository's **Settings** → **Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and the `/ (root)` folder, then save.
6. Submit the generated `https://<username>.github.io/<repository>/` URL.

## Files

- `index.html` — page structure and local D3 reference
- `styles.css` — visual template and responsive layout
- `d3.v7.min.js` — permitted D3 library stored locally
- `app.js` — scenes, annotations, parameters, and triggers
- `data/us_car_model_sales_2013_2022.csv` — the Kaggle dataset
- `submission_essay.md` — submission essay covering the rubric
