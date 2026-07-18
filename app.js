/*
  Narrative visualization parameters (state variables):
  - state.scene: current narrative scene
  - state.selectedBrand: brand shown in the explorer
  - state.selectedModels: models shown in the explorer
  - state.hoveredPoint: current tooltip target

  Triggers:
  - Back/Next buttons and progress dots change state.scene
  - Brand dropdown changes state.selectedBrand
  - Model checkboxes change state.selectedModels
  - Pointer events change state.hoveredPoint and reveal tooltips
*/

const DATA_PATH = "./us_car_model_sales_2013_2022.csv";
const state = {
  scene: 0,
  selectedBrand: null,
  selectedModels: [],
  hoveredPoint: null
};

const sceneDefinitions = [
  {
    kicker: "Scene 1 · The market",
    title: "A decade of growth was interrupted by a sudden market shock",
    description: "Annual model sales are added together to show the market's overall direction. The annotation identifies the steepest year-over-year decline in the dataset."
  },
  {
    kicker: "Scene 2 · The leaders",
    title: "A small group of models repeatedly captures an outsized share of sales",
    description: "The highest-selling models across the decade are compared on a shared scale. Persistent leaders stay visible while challengers rise, fall, or enter later."
  },
  {
    kicker: "Scene 3 · Explore",
    title: "Every brand contains a different story",
    description: "Choose a brand and compare its strongest models. Hover over a point to inspect an exact annual sales value."
  }
];

const elements = {
  svg: d3.select("#chart"),
  chartWrap: d3.select("#chart-wrap"),
  tooltip: d3.select("#tooltip"),
  title: d3.select("#scene-title"),
  kicker: d3.select("#scene-kicker"),
  description: d3.select("#scene-description"),
  sceneCount: d3.select("#scene-count"),
  insight: d3.select("#scene-insight"),
  back: d3.select("#back-button"),
  next: d3.select("#next-button"),
  progress: d3.select("#progress-dots"),
  explorer: d3.select("#explorer-controls"),
  brandSelect: d3.select("#brand-select"),
  modelOptions: d3.select("#model-options")
};

let dataset = null;
let resizeTimer = null;

initialize();

async function initialize() {
  renderLoading();

  try {
    const raw = await d3.csv(DATA_PATH);
    dataset = normalizeData(raw);
    validateData(dataset);
    initializeExplorerDefaults();
    createProgressDots();
    bindTriggers();
    renderScene();
  } catch (error) {
    console.error(error);
    renderError(error.message);
  }
}

function normalizeData(rawRows) {
  if (!rawRows.length) throw new Error("The CSV contains no rows.");

  const columns = rawRows.columns || Object.keys(rawRows[0]);
  const years = columns.filter(column => /^\d{4}$/.test(column.trim())).map(Number).sort(d3.ascending);
  const idColumns = columns.filter(column => !/^\d{4}$/.test(column.trim()));

  if (years.length < 2) {
    throw new Error("No annual columns were found. Expected headings such as 2013, 2014, …, 2022.");
  }
  if (idColumns.length < 2) {
    throw new Error("Expected separate model and brand columns before the year columns.");
  }

  // The Kaggle file uses Maker/Brand for the manufacturer and Maker_Brand for the full make/model label.
  const exactBrand = idColumns.find(column => column.trim().toLowerCase() === "maker/brand");
  const exactModel = idColumns.find(column => column.trim().toLowerCase() === "maker_brand");
  const probableBrand = idColumns.find(column => /(^|[\s_/])(brand|make|maker)($|[\s_/])/i.test(column));
  const brandColumn = exactBrand || probableBrand || idColumns[0];
  const modelColumn = exactModel || idColumns.find(column => column !== brandColumn) || idColumns[1];

  const rows = rawRows.map((row, rowIndex) => {
    const brand = cleanLabel(row[brandColumn]) || "Unknown brand";
    const fullModel = cleanLabel(row[modelColumn]) || `Unnamed model ${rowIndex + 1}`;
    const model = stripBrandPrefix(fullModel, brand) || fullModel;
    const values = years.map(year => ({
      year,
      sales: parseSales(row[String(year)])
    }));
    const isAggregate = /\b(total|unclassified)\b/i.test(model);
    return { brand, model, fullModel, values, isAggregate };
  }).filter(row => d3.sum(row.values, value => value.sales) > 0);

  return { rows, years, brandColumn, modelColumn };
}

function cleanLabel(value) {
  return String(value ?? "")
    .trim()
    .replace(/(?<=[A-Za-z])0(?=[A-Za-z])/g, "-")
    .replace(/\s+/g, " ");
}

function stripBrandPrefix(fullModel, brand) {
  let model = fullModel;
  const prefix = `${brand} `;
  while (model.toLowerCase().startsWith(prefix.toLowerCase())) {
    model = model.slice(prefix.length).trim();
  }
  return model;
}

function parseSales(value) {
  if (value === null || value === undefined || value === "") return 0;
  const cleaned = String(value).replace(/[$,%\s]/g, "").replace(/,/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function validateData(data) {
  if (!data.rows.length) throw new Error("No rows with positive sales values were found.");
}

function initializeExplorerDefaults() {
  const modelRows = dataset.rows.filter(row => !row.isAggregate);
  const brandTotals = d3.rollups(
    modelRows,
    rows => d3.sum(rows, row => d3.sum(row.values, value => value.sales)),
    row => row.brand
  ).sort((a, b) => d3.descending(a[1], b[1]));

  state.selectedBrand = brandTotals[0][0];
  state.selectedModels = topModelsForBrand(state.selectedBrand, 4).map(row => row.model);
}

function bindTriggers() {
  elements.back.on("click", () => setScene(state.scene - 1));
  elements.next.on("click", () => setScene(state.scene + 1));

  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(renderScene, 120);
  });
}

function createProgressDots() {
  elements.progress.selectAll("button")
    .data(sceneDefinitions)
    .join("button")
    .attr("type", "button")
    .attr("class", "progress-dot")
    .attr("aria-label", (_, index) => `Go to scene ${index + 1}`)
    .on("click", (_, index) => setScene(index));
}

function setScene(nextScene) {
  state.scene = Math.max(0, Math.min(sceneDefinitions.length - 1, nextScene));
  renderScene();
}

function renderScene() {
  if (!dataset) return;

  const scene = sceneDefinitions[state.scene];
  elements.kicker.text(scene.kicker);
  elements.title.text(scene.title);
  elements.description.text(scene.description);
  elements.sceneCount.text(`${state.scene + 1} / ${sceneDefinitions.length}`);
  elements.back.property("disabled", state.scene === 0);
  elements.next
    .property("disabled", state.scene === sceneDefinitions.length - 1)
    .text(state.scene === sceneDefinitions.length - 1 ? "End" : "Next →");

  elements.progress.selectAll("button")
    .classed("active", (_, index) => index === state.scene)
    .attr("aria-current", (_, index) => index === state.scene ? "step" : null);

  elements.explorer.property("hidden", state.scene !== 2);
  elements.tooltip.property("hidden", true);
  elements.insight.html("");

  const width = Math.max(680, elements.chartWrap.node().clientWidth);
  const height = window.innerWidth <= 760 ? 400 : 430;
  elements.svg.attr("viewBox", `0 0 ${width} ${height}`).attr("height", height);
  elements.svg.selectAll("*").remove();

  if (state.scene === 0) renderMarketScene(width, height);
  if (state.scene === 1) renderLeaderScene(width, height);
  if (state.scene === 2) renderExplorerScene(width, height);
}

function renderMarketScene(width, height) {
  const totals = dataset.years.map(year => ({
    year,
    sales: d3.sum(dataset.rows, row => row.values.find(value => value.year === year)?.sales || 0)
  }));

  const margins = { top: 30, right: 40, bottom: 58, left: 78 };
  const innerWidth = width - margins.left - margins.right;
  const innerHeight = height - margins.top - margins.bottom;
  const g = elements.svg.append("g").attr("transform", `translate(${margins.left},${margins.top})`);

  const x = d3.scaleLinear().domain(d3.extent(dataset.years)).range([0, innerWidth]);
  const y = d3.scaleLinear()
    .domain([0, d3.max(totals, d => d.sales) * 1.08])
    .nice()
    .range([innerHeight, 0]);

  drawAxes(g, x, y, innerWidth, innerHeight, dataset.years);

  const area = d3.area()
    .x(d => x(d.year))
    .y0(innerHeight)
    .y1(d => y(d.sales))
    .curve(d3.curveMonotoneX);

  const line = d3.line()
    .x(d => x(d.year))
    .y(d => y(d.sales))
    .curve(d3.curveMonotoneX);

  const gradient = elements.svg.append("defs").append("linearGradient")
    .attr("id", "market-gradient")
    .attr("x1", "0").attr("y1", "0").attr("x2", "0").attr("y2", "1");
  gradient.append("stop").attr("offset", "0%").attr("stop-color", "#175cd3").attr("stop-opacity", 0.28);
  gradient.append("stop").attr("offset", "100%").attr("stop-color", "#175cd3").attr("stop-opacity", 0.02);

  g.append("path").datum(totals).attr("d", area).attr("fill", "url(#market-gradient)");
  g.append("path").datum(totals).attr("d", line).attr("fill", "none").attr("stroke", "#175cd3").attr("stroke-width", 3.2);

  g.selectAll("circle.market-point")
    .data(totals)
    .join("circle")
    .attr("class", "market-point")
    .attr("cx", d => x(d.year))
    .attr("cy", d => y(d.sales))
    .attr("r", 5.5)
    .attr("fill", "#fff")
    .attr("stroke", "#175cd3")
    .attr("stroke-width", 2.5)
    .on("pointerenter", (event, d) => showTooltip(event, `All models`, d.year, d.sales))
    .on("pointermove", moveTooltip)
    .on("pointerleave", hideTooltip);

  const changes = totals.slice(1).map((d, index) => ({
    ...d,
    previous: totals[index].sales,
    delta: d.sales - totals[index].sales,
    percent: totals[index].sales ? (d.sales - totals[index].sales) / totals[index].sales : 0
  }));
  const steepestDrop = d3.least(changes, d => d.delta);
  const peak = d3.greatest(totals, d => d.sales);

  addAnnotation(g, {
    anchorX: x(steepestDrop.year),
    anchorY: y(steepestDrop.sales),
    boxX: clamp(x(steepestDrop.year) - 178, 8, innerWidth - 210),
    boxY: clamp(y(steepestDrop.sales) - 112, 10, innerHeight - 80),
    width: 205,
    title: `${steepestDrop.year}: steepest decline`,
    body: `${formatPercent(steepestDrop.percent)} from the prior year`
  });

  renderMetrics([
    { label: "Peak year", value: peak.year, note: `${formatSales(peak.sales)} vehicles` },
    { label: "Largest annual drop", value: steepestDrop.year, note: `${formatSignedPercent(steepestDrop.percent)} year over year` },
    { label: "Ten-year change", value: formatSignedPercent((totals.at(-1).sales - totals[0].sales) / totals[0].sales), note: `${totals[0].year} to ${totals.at(-1).year}` }
  ]);
}

function renderLeaderScene(width, height) {
  const modelRows = dataset.rows.filter(row => !row.isAggregate);
  const rankedRows = modelRows
    .map(row => ({ ...row, total: d3.sum(row.values, value => value.sales) }))
    .sort((a, b) => d3.descending(a.total, b.total));
  const latestOverall = d3.greatest(rankedRows, row => row.values.at(-1).sales);
  let topRows = rankedRows.slice(0, 7);
  if (!topRows.some(row => row.fullModel === latestOverall.fullModel)) {
    topRows = [...rankedRows.slice(0, 6), latestOverall]
      .sort((a, b) => d3.descending(a.total, b.total));
  }

  const margins = { top: 25, right: 155, bottom: 58, left: 78 };
  const innerWidth = width - margins.left - margins.right;
  const innerHeight = height - margins.top - margins.bottom;
  const g = elements.svg.append("g").attr("transform", `translate(${margins.left},${margins.top})`);

  const x = d3.scaleLinear().domain(d3.extent(dataset.years)).range([0, innerWidth]);
  const y = d3.scaleLinear()
    .domain([0, d3.max(topRows, row => d3.max(row.values, value => value.sales)) * 1.08])
    .nice()
    .range([innerHeight, 0]);
  const color = d3.scaleOrdinal()
    .domain(topRows.map(row => row.model))
    .range(["#175cd3", "#b42318", "#027a48", "#7a5af8", "#dc6803", "#0e7090", "#475467"]);

  drawAxes(g, x, y, innerWidth, innerHeight, dataset.years);

  const line = d3.line()
    .defined(d => d.sales > 0)
    .x(d => x(d.year))
    .y(d => y(d.sales))
    .curve(d3.curveMonotoneX);

  const series = g.selectAll("g.model-series")
    .data(topRows)
    .join("g")
    .attr("class", "model-series");

  series.append("path")
    .attr("d", d => line(d.values))
    .attr("fill", "none")
    .attr("stroke", d => color(d.model))
    .attr("stroke-width", (d, index) => index === 0 ? 3.8 : 2.2)
    .attr("opacity", (d, index) => index === 0 ? 1 : 0.82);

  series.selectAll("circle")
    .data(row => row.values.filter(value => value.sales > 0).map(value => ({ ...value, row })))
    .join("circle")
    .attr("cx", d => x(d.year))
    .attr("cy", d => y(d.sales))
    .attr("r", 4.2)
    .attr("fill", d => color(d.row.model))
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.2)
    .on("pointerenter", (event, d) => showTooltip(event, `${d.row.brand} ${d.row.model}`, d.year, d.sales))
    .on("pointermove", moveTooltip)
    .on("pointerleave", hideTooltip);

  const endpointRows = topRows
    .map(row => ({ row, end: row.values.at(-1) }))
    .sort((a, b) => d3.ascending(y(a.end.sales), y(b.end.sales)));
  const labelPositions = distributeLabelPositions(endpointRows.map(item => y(item.end.sales)), 18, 10, innerHeight - 5);
  endpointRows.forEach((item, index) => {
    const targetY = labelPositions[index];
    g.append("line")
      .attr("x1", innerWidth + 4).attr("x2", innerWidth + 18)
      .attr("y1", targetY).attr("y2", targetY)
      .attr("stroke", color(item.row.model));
    g.append("text")
      .attr("class", "series-label")
      .attr("x", innerWidth + 23)
      .attr("y", targetY + 4)
      .attr("fill", color(item.row.model))
      .text(shorten(item.row.model, 17));
  });

  const latestLeader = latestOverall;
  const lastValue = latestLeader.values.at(-1);
  addAnnotation(g, {
    anchorX: x(lastValue.year),
    anchorY: y(lastValue.sales),
    boxX: clamp(innerWidth * 0.56, 10, innerWidth - 220),
    boxY: 12,
    width: 215,
    title: `${latestLeader.model} leads in ${lastValue.year}`,
    body: `${formatSales(lastValue.sales)} vehicles sold`
  });

  const concentration = d3.sum(topRows, row => row.total) /
    d3.sum(modelRows, row => d3.sum(row.values, value => value.sales));

  renderMetrics([
    { label: "Decade sales leader", value: topRows[0].model, note: `${topRows[0].brand} · ${formatSales(topRows[0].total)} cumulative` },
    { label: `Leader in ${dataset.years.at(-1)}`, value: latestLeader.model, note: `${formatSales(lastValue.sales)} vehicles` },
    { label: "Top seven share", value: d3.format(".1%")(concentration), note: "Share of named-model sales in the dataset" }
  ]);
}

function renderExplorerScene(width, height) {
  configureExplorerControls();

  const brandRows = dataset.rows.filter(row => row.brand === state.selectedBrand && !row.isAggregate);
  const selectedRows = brandRows.filter(row => state.selectedModels.includes(row.model));
  const rowsToDraw = selectedRows.length ? selectedRows : topModelsForBrand(state.selectedBrand, 1);

  const margins = { top: 25, right: 145, bottom: 58, left: 78 };
  const innerWidth = width - margins.left - margins.right;
  const innerHeight = height - margins.top - margins.bottom;
  const g = elements.svg.append("g").attr("transform", `translate(${margins.left},${margins.top})`);

  const x = d3.scaleLinear().domain(d3.extent(dataset.years)).range([0, innerWidth]);
  const yMax = d3.max(rowsToDraw, row => d3.max(row.values, value => value.sales)) || 1;
  const y = d3.scaleLinear().domain([0, yMax * 1.1]).nice().range([innerHeight, 0]);
  const color = d3.scaleOrdinal()
    .domain(rowsToDraw.map(row => row.model))
    .range(d3.schemeTableau10);

  drawAxes(g, x, y, innerWidth, innerHeight, dataset.years);

  const line = d3.line()
    .defined(d => d.sales > 0)
    .x(d => x(d.year))
    .y(d => y(d.sales))
    .curve(d3.curveMonotoneX);

  const series = g.selectAll("g.explorer-series")
    .data(rowsToDraw)
    .join("g")
    .attr("class", "explorer-series");

  series.append("path")
    .attr("d", row => line(row.values))
    .attr("fill", "none")
    .attr("stroke", row => color(row.model))
    .attr("stroke-width", 3);

  series.selectAll("circle")
    .data(row => row.values.filter(value => value.sales > 0).map(value => ({ ...value, row })))
    .join("circle")
    .attr("cx", d => x(d.year))
    .attr("cy", d => y(d.sales))
    .attr("r", 5)
    .attr("fill", d => color(d.row.model))
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5)
    .style("cursor", "crosshair")
    .on("pointerenter", (event, d) => showTooltip(event, `${d.row.brand} ${d.row.model}`, d.year, d.sales))
    .on("pointermove", moveTooltip)
    .on("pointerleave", hideTooltip);

  rowsToDraw.forEach(row => {
    const end = [...row.values].reverse().find(value => value.sales > 0) || row.values.at(-1);
    g.append("text")
      .attr("class", "series-label")
      .attr("x", Math.min(innerWidth + 12, x(end.year) + 12))
      .attr("y", y(end.sales) + 4)
      .attr("fill", color(row.model))
      .text(shorten(row.model, 18));
  });

  const growthRows = rowsToDraw.map(row => {
    const first = row.values.find(value => value.sales > 0);
    const last = [...row.values].reverse().find(value => value.sales > 0);
    return { row, change: first && last && first.sales ? (last.sales - first.sales) / first.sales : 0 };
  });
  const biggestGainer = d3.greatest(growthRows, d => d.change);
  const currentLeader = d3.greatest(rowsToDraw, row => row.values.at(-1).sales);

  renderMetrics([
    { label: "Selected brand", value: state.selectedBrand, note: `${brandRows.length} models in the dataset` },
    { label: `Highest ${dataset.years.at(-1)} sales`, value: currentLeader.model, note: formatSales(currentLeader.values.at(-1).sales) },
    { label: "Best first-to-last change", value: biggestGainer.row.model, note: formatSignedPercent(biggestGainer.change) }
  ]);
}

function configureExplorerControls() {
  const brands = Array.from(new Set(dataset.rows.filter(row => !row.isAggregate).map(row => row.brand))).sort(d3.ascending);

  elements.brandSelect
    .selectAll("option")
    .data(brands)
    .join("option")
    .attr("value", d => d)
    .text(d => d);

  elements.brandSelect
    .property("value", state.selectedBrand)
    .on("change", event => {
      state.selectedBrand = event.target.value;
      state.selectedModels = topModelsForBrand(state.selectedBrand, 4).map(row => row.model);
      renderScene();
    });

  const brandRows = topModelsForBrand(state.selectedBrand, 8);
  const choices = elements.modelOptions.selectAll("label")
    .data(brandRows, row => row.model)
    .join(enter => {
      const label = enter.append("label").attr("class", "model-choice");
      label.append("input").attr("type", "checkbox");
      label.append("span");
      return label;
    });

  choices.select("input")
    .property("checked", row => state.selectedModels.includes(row.model))
    .on("change", (event, row) => {
      if (event.target.checked) {
        if (!state.selectedModels.includes(row.model)) state.selectedModels.push(row.model);
      } else {
        state.selectedModels = state.selectedModels.filter(model => model !== row.model);
      }
      renderScene();
    });

  choices.select("span").text(row => row.model);
}

function topModelsForBrand(brand, count) {
  return dataset.rows
    .filter(row => row.brand === brand && !row.isAggregate)
    .map(row => ({ ...row, total: d3.sum(row.values, value => value.sales) }))
    .sort((a, b) => d3.descending(a.total, b.total))
    .slice(0, count);
}

function distributeLabelPositions(positions, minimumGap, minimum, maximum) {
  if (!positions.length) return [];
  const adjusted = positions.map(position => clamp(position, minimum, maximum));
  for (let index = 1; index < adjusted.length; index += 1) {
    adjusted[index] = Math.max(adjusted[index], adjusted[index - 1] + minimumGap);
  }
  if (adjusted.at(-1) > maximum) {
    adjusted[adjusted.length - 1] = maximum;
    for (let index = adjusted.length - 2; index >= 0; index -= 1) {
      adjusted[index] = Math.min(adjusted[index], adjusted[index + 1] - minimumGap);
    }
  }
  return adjusted.map(position => clamp(position, minimum, maximum));
}

function drawAxes(g, x, y, innerWidth, innerHeight, years) {
  g.append("g")
    .attr("class", "grid")
    .call(d3.axisLeft(y).ticks(5).tickSize(-innerWidth).tickFormat(""));

  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickValues(years).tickFormat(d3.format("d")));

  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).ticks(5).tickFormat(formatAxisSales));

  g.append("text")
    .attr("class", "axis-label")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + 45)
    .attr("text-anchor", "middle")
    .text("Calendar year");

  g.append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerHeight / 2)
    .attr("y", -58)
    .attr("text-anchor", "middle")
    .text("Vehicles sold");
}

function addAnnotation(g, { anchorX, anchorY, boxX, boxY, width, title, body }) {
  const height = 62;
  const attachX = boxX + (anchorX < boxX ? 0 : anchorX > boxX + width ? width : width / 2);
  const attachY = boxY + height;

  g.append("path")
    .attr("class", "annotation-line")
    .attr("d", `M${anchorX},${anchorY} L${anchorX},${attachY + 8} L${attachX},${attachY + 8} L${attachX},${attachY}`);

  g.append("circle")
    .attr("cx", anchorX)
    .attr("cy", anchorY)
    .attr("r", 5.8)
    .attr("fill", "#fff")
    .attr("stroke", "#b42318")
    .attr("stroke-width", 2.5);

  const card = g.append("g").attr("class", "annotation-card").attr("transform", `translate(${boxX},${boxY})`);
  card.append("rect").attr("width", width).attr("height", height);
  card.append("text").attr("class", "annotation-title").attr("x", 12).attr("y", 23).text(title);
  card.append("text").attr("class", "annotation-body").attr("x", 12).attr("y", 43).text(body);
}

function renderMetrics(metrics) {
  elements.insight.selectAll("div.metric")
    .data(metrics)
    .join("div")
    .attr("class", "metric")
    .html(metric => `
      <span class="metric-label">${escapeHtml(String(metric.label))}</span>
      <strong>${escapeHtml(String(metric.value))}</strong>
      <small>${escapeHtml(String(metric.note || ""))}</small>
    `);
}

function showTooltip(event, label, year, sales) {
  state.hoveredPoint = { label, year, sales };
  elements.tooltip
    .property("hidden", false)
    .html(`<strong>${escapeHtml(label)}</strong><span>${year}</span><br>${formatSales(sales)} vehicles`);
  moveTooltip(event);
}

function moveTooltip(event) {
  const bounds = elements.chartWrap.node().getBoundingClientRect();
  const tooltipNode = elements.tooltip.node();
  const left = Math.min(event.clientX - bounds.left + 14, bounds.width - tooltipNode.offsetWidth - 8);
  const top = Math.max(8, event.clientY - bounds.top - tooltipNode.offsetHeight - 12);
  elements.tooltip.style("left", `${left}px`).style("top", `${top}px`);
}

function hideTooltip() {
  state.hoveredPoint = null;
  elements.tooltip.property("hidden", true);
}

function renderLoading() {
  elements.svg.attr("viewBox", "0 0 900 430");
  elements.svg.append("text")
    .attr("x", 450).attr("y", 215).attr("text-anchor", "middle")
    .attr("fill", "#667085").text("Loading vehicle sales data…");
}

function renderError(message) {
  elements.svg.selectAll("*").remove();
  elements.svg.attr("viewBox", "0 0 900 430");
  elements.svg.append("text")
    .attr("x", 450).attr("y", 200).attr("text-anchor", "middle")
    .attr("fill", "#b42318").attr("font-weight", 700)
    .text("The visualization could not load the CSV.");
  elements.svg.append("text")
    .attr("x", 450).attr("y", 230).attr("text-anchor", "middle")
    .attr("fill", "#667085").text(message);
}

function formatSales(value) {
  return d3.format(",.0f")(value);
}

function formatAxisSales(value) {
  return d3.format("~s")(value).replace("G", "B");
}

function formatPercent(value) {
  return d3.format(".1%")(Math.abs(value));
}

function formatSignedPercent(value) {
  return d3.format("+.1%")(value);
}

function shorten(text, length) {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;"
  })[character]);
}
