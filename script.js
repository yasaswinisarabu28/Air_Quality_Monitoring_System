/* ---------- API Configuration ---------- */

const API_KEY = "PASTE-YOUR-NEW-KEY-HERE";

const OPENWEATHER_GEO_URL =
    "https://api.openweathermap.org/geo/1.0/direct";

const OPENWEATHER_AIR_URL =
    "https://api.openweathermap.org/data/2.5/air_pollution";

const NOMINATIM_URL =
    "https://nominatim.openstreetmap.org/search";


/* ---------- CPCB calculation (same method as before) ---------- */

function calcSubIndex(Cp, BP_Lo, BP_Hi, I_Lo, I_Hi) {
    return ((I_Hi - I_Lo) / (BP_Hi - BP_Lo)) * (Cp - BP_Lo) + I_Lo;
}

// Sub-index for one pollutant. Returns null if the value is missing.
// (Small fix: decimal values such as 30.5 used to fall between two ranges and
// returned 0, and values above the last range also returned 0.)
function getSubIndex(value, table) {
    if (typeof value !== "number" || isNaN(value) || value < 0) return null;

    for (let bp of table) {
        if (value <= bp[1]) {
            return Math.round(
                calcSubIndex(value, bp[0], bp[1], bp[2], bp[3])
            );
        }
    }

    return 500; // above the highest range: CPCB scale is capped at 500
}

function getCPCB_AQI(pm25, pm10) {

    let pm25_bp = [
        [0, 30, 0, 50],
        [31, 60, 51, 100],
        [61, 90, 101, 200],
        [91, 120, 201, 300],
        [121, 250, 301, 400],
        [251, 350, 401, 500]
    ];

    let pm10_bp = [
        [0, 50, 0, 50],
        [51, 100, 51, 100],
        [101, 250, 101, 200],
        [251, 350, 201, 300],
        [351, 430, 301, 400],
        [431, 600, 401, 500]
    ];

    const aqi25 = getSubIndex(pm25, pm25_bp);
    const aqi10 = getSubIndex(pm10, pm10_bp);

    // Both pollutants are needed. Nothing is substituted when one is missing.
    if (aqi25 === null || aqi10 === null) return null;

    return Math.max(aqi25, aqi10);
}

function getCPCB_Category(aqi) {
    if (aqi <= 50) return "Good";
    if (aqi <= 100) return "Satisfactory";
    if (aqi <= 200) return "Moderate";
    if (aqi <= 300) return "Poor";
    if (aqi <= 400) return "Very Poor";
    return "Severe";
}


/* ---------- Display information for each CPCB category ---------- */

const CPCB_INFO = {
    "Good": {
        range: "0–50",
        color: "#1a9850",
        soft: "#e8f6ee",
        on: "#0d5a2d",
        concern: "No need to worry",
        meaning: "Air quality is good. It poses little or no risk, and you can do outdoor activities as usual."
    },

    "Satisfactory": {
        range: "51–100",
        color: "#7cb518",
        soft: "#f0f7e1",
        on: "#476a0a",
        concern: "Low concern",
        meaning: "Air quality is generally acceptable for most people. Sensitive individuals may experience some effects."
    },

    "Moderate": {
        range: "101–200",
        color: "#e0a800",
        soft: "#fdf5dc",
        on: "#7a5b00",
        concern: "Mild concern for sensitive people",
        meaning: "Most people will be fine. People with lung or heart conditions, older adults and children may feel some breathing discomfort."
    },

    "Poor": {
        range: "201–300",
        color: "#ee7d1a",
        soft: "#fdeedd",
        on: "#8a4308",
        concern: "Take some precautions",
        meaning: "Staying outdoors for long may cause discomfort for many people. Consider limiting long outdoor activity, especially if you have breathing or heart problems."
    },

    "Very Poor": {
        range: "301–400",
        color: "#d9362f",
        soft: "#fcebea",
        on: "#8f1d18",
        concern: "High concern",
        meaning: "Breathing discomfort is likely with longer exposure. Limit outdoor activity, and sensitive people should stay indoors where possible."
    },

    "Severe": {
        range: "401–500",
        color: "#8e1b3a",
        soft: "#f7e6ea",
        on: "#6b1029",
        concern: "Serious concern",
        meaning: "Air quality can affect even healthy people and is risky for those with health conditions. Avoid outdoor exertion and wear a mask such as an N95 if you must go out."
    }
};

const CPCB_ORDER = [
    "Good",
    "Satisfactory",
    "Moderate",
    "Poor",
    "Very Poor",
    "Severe"
];

const CPCB_WIDTHS = [50, 50, 100, 100, 100, 100];


// OpenWeather uses a 1–5 scale
const OW_MEANING = {
    1: "Good",
    2: "Fair",
    3: "Moderate",
    4: "Poor",
    5: "Very Poor"
};


/* ---------- Small helpers ---------- */

function escapeHTML(text) {
    const d = document.createElement("div");
    d.textContent = text;
    return d.innerHTML;
}

function formatValue(v) {
    return (typeof v === "number" && !isNaN(v))
        ? Number(v.toFixed(2))
        : null;
}

function showLoading(el) {
    el.innerHTML = `
        <div class="card status">
            <div class="spinner" aria-hidden="true"></div>
            <p>Checking air quality...</p>
        </div>`;
}

function showError(el, title, message) {
    el.innerHTML = `
        <div class="card status error">
            ${title ? `<h2>${title}</h2>` : ""}
            <p>${message}</p>
        </div>`;
}

function pollutantCard(name, value, description) {
    const v = formatValue(value);

    return `
        <div class="card pollutant">
            <h3>${name}</h3>
            <p class="pollutant-value">
                ${v !== null
                    ? `${v} <span>µg/m³</span>`
                    : `<span>Not available</span>`
                }
            </p>
            <p class="muted">${description}</p>
        </div>`;
}

function scaleHTML(aqi) {

    const segments = CPCB_ORDER.map((name, i) =>
        `<span
            style="flex:${CPCB_WIDTHS[i]}; background:${CPCB_INFO[name].color}"
            title="${name}">
        </span>`
    ).join("");

    const legend = CPCB_ORDER.map(name =>
        `<li>
            <i style="background:${CPCB_INFO[name].color}"></i>
            <b>${name}</b> ${CPCB_INFO[name].range}
        </li>`
    ).join("");

    const pos = Math.min(aqi, 500) / 500 * 100;

    return `
        <div class="scale" aria-hidden="true">
            <div class="scale-bar">${segments}</div>
            <div class="scale-marker" style="left:${pos}%">
                <em>${aqi}</em>
            </div>
        </div>

        <ul class="legend">${legend}</ul>`;
}


/* ---------- Place suggestions (autocomplete) ---------- */

let selectedPlace = null;
let suggestTimer = null;
let suggestController = null;
let currentSuggestions = [];
let activeIndex = -1;

function buildPlaceLabel(p) {
    const area = p.district || p.county || p.city;

    const parts = [
        p.name,
        area,
        p.state
    ].filter(Boolean);

    // remove repeats such as "Delhi, Delhi"
    return parts
        .filter((x, i) => x !== parts[i - 1])
        .join(", ");
}

async function fetchSuggestions(query) {

    if (suggestController) {
        suggestController.abort();
    }

    suggestController = new AbortController();

    const url =
        `${OPENWEATHER_GEO_URL}?q=${encodeURIComponent(query)},IN&limit=5&appid=${API_KEY}`;

    const res = await fetch(url, {
        signal: suggestController.signal
    });

    if (!res.ok) {
        throw new Error("Suggestion request failed");
    }

    const data = await res.json();

    const seen = new Set();
    const list = [];

    for (const p of data) {

        const label = [
            p.name,
            p.state
        ].filter(Boolean).join(", ");

        if (seen.has(label)) continue;

        seen.add(label);

        list.push({
            label,
            lat: p.lat,
            lon: p.lon
        });
    }

    return list;
}

function hideSuggestions() {

    const box = document.getElementById("suggestions");
    const input = document.getElementById("area");

    box.hidden = true;
    box.innerHTML = "";

    input.setAttribute("aria-expanded", "false");

    currentSuggestions = [];
    activeIndex = -1;
}

function renderSuggestions(list) {

    const box = document.getElementById("suggestions");
    const input = document.getElementById("area");

    currentSuggestions = list;
    activeIndex = -1;

    if (list.length === 0) {

        box.innerHTML =
            `<li class="no-match">No matching places found</li>`;

    } else {

        box.innerHTML = list.map((s, i) =>
            `<li role="option" data-index="${i}">
                ${escapeHTML(s.label)}
            </li>`
        ).join("");
    }

    box.hidden = false;
    input.setAttribute("aria-expanded", "true");
}

function chooseSuggestion(i) {

    const s = currentSuggestions[i];

    if (!s) return;

    document.getElementById("area").value = s.label;

    selectedPlace = s;

    hideSuggestions();
}

function highlight(i) {

    const items =
        document.querySelectorAll("#suggestions li[role='option']");

    items.forEach(li =>
        li.classList.remove("active")
    );

    if (items[i]) {

        items[i].classList.add("active");

        items[i].scrollIntoView({
            block: "nearest"
        });
    }

    activeIndex = i;
}

function setupAutocomplete() {

    const input = document.getElementById("area");
    const box = document.getElementById("suggestions");

    if (!input || !box) return;

    input.addEventListener("input", () => {

        selectedPlace = null;

        clearTimeout(suggestTimer);

        const q = input.value.trim();

        if (q.length < 2) {
            hideSuggestions();
            return;
        }

        suggestTimer = setTimeout(async () => {

            try {

                renderSuggestions(
                    await fetchSuggestions(q)
                );

            } catch (err) {

                if (err.name !== "AbortError") {
                    hideSuggestions();
                }
            }

        }, 300);
    });


    input.addEventListener("keydown", (e) => {

        const open =
            !box.hidden &&
            currentSuggestions.length > 0;

        if (e.key === "ArrowDown" && open) {

            e.preventDefault();

            highlight(
                (activeIndex + 1) %
                currentSuggestions.length
            );

        } else if (e.key === "ArrowUp" && open) {

            e.preventDefault();

            highlight(
                (activeIndex - 1 +
                    currentSuggestions.length) %
                currentSuggestions.length
            );

        } else if (e.key === "Enter") {

            if (open && activeIndex >= 0) {

                e.preventDefault();

                chooseSuggestion(activeIndex);

            } else {

                clearTimeout(suggestTimer);

                hideSuggestions();

                getPollution();
            }

        } else if (e.key === "Escape") {

            hideSuggestions();
        }
    });


    // mousedown (not click) so it fires before the input loses focus
    box.addEventListener("mousedown", (e) => {

        const li =
            e.target.closest("li[role='option']");

        if (li) {

            e.preventDefault();

            chooseSuggestion(
                Number(li.dataset.index)
            );
        }
    });


    document.addEventListener("click", (e) => {

        if (!e.target.closest(".search-field")) {
            hideSuggestions();
        }
    });
}


/* ---------- Main function ---------- */

async function getPollution() {

    const area =
        document.getElementById("area").value.trim();

    const resultDiv =
        document.getElementById("result");

    const button =
        document.getElementById("searchBtn");


    if (!area) {

        showError(
            resultDiv,
            "Enter an area name",
            "Type a city or area name above and try again."
        );

        return;
    }

    clearTimeout(suggestTimer);

    showLoading(resultDiv);

    hideSuggestions();

    button.disabled = true;


    try {

        // STEP 1: Get Coordinates

        let lat, lon;

        if (
            selectedPlace &&
            selectedPlace.label === area
        ) {

            // user picked a suggestion,
            // so we already have the coordinates

            lat = selectedPlace.lat;
            lon = selectedPlace.lon;

        } else {

            // user typed freely:
            // fall back to the old search

            const geoRes = await fetch(
                `${NOMINATIM_URL}?q=${encodeURIComponent(area)}&countrycodes=in&format=json&limit=1`
            );

            if (!geoRes.ok) {
                throw new Error("Geocoding failed");
            }

            const geoData = await geoRes.json();

            if (geoData.length === 0) {

                showError(
                    resultDiv,
                    "Area not found",
                    "Please check the spelling and try again."
                );

                return;
            }

            lat = geoData[0].lat;
            lon = geoData[0].lon;
        }


        // STEP 2: Get Pollution Data

        const weatherRes = await fetch(
            `${OPENWEATHER_AIR_URL}?lat=${lat}&lon=${lon}&appid=${API_KEY}`
        );

        if (!weatherRes.ok) {
            throw new Error("Air pollution request failed");
        }

        const weatherData = await weatherRes.json();

        const item =
            weatherData.list &&
            weatherData.list[0];

        if (!item) {
            throw new Error(
                "No air pollution data returned"
            );
        }

        const apiAQI =
            item.main
                ? item.main.aqi
                : undefined;

        const pm25 =
            item.components
                ? item.components.pm2_5
                : undefined;

        const pm10 =
            item.components
                ? item.components.pm10
                : undefined;

        const apiCategory =
            OW_MEANING[apiAQI] || "Unknown";


        // CPCB AQI Calculation

        const cpcbAQI =
            getCPCB_AQI(pm25, pm10);


        // STEP 3: Display

        renderReport(
            resultDiv,
            area,
            apiAQI,
            apiCategory,
            pm25,
            pm10,
            cpcbAQI
        );

    } catch (err) {

        console.error(err);

        showError(
            resultDiv,
            "",
            "Unable to fetch air-quality data right now. Please try again later."
        );

    } finally {

        button.disabled = false;
    }
}


function renderReport(
    el,
    area,
    apiAQI,
    apiCategory,
    pm25,
    pm10,
    cpcbAQI
) {

    const safeArea =
        escapeHTML(area);

    let mainCard;

    let meaningCard = "";


    if (cpcbAQI === null) {

        mainCard = `
            <section class="card aqi-card unavailable">
                <p class="card-label">
                    CPCB AQI (PM2.5 &amp; PM10 based)
                </p>

                <p class="aqi-category">
                    Not available
                </p>

                <p class="summary">
                    The CPCB AQI could not be calculated
                    for ${safeArea} because the PM2.5 or
                    PM10 value is missing from the data.
                    No substitute value has been used.
                </p>
            </section>`;

    } else {

        const category =
            getCPCB_Category(cpcbAQI);

        const info =
            CPCB_INFO[category];


        mainCard = `
            <section
                class="card aqi-card"
                style="
                    --cat:${info.color};
                    --soft:${info.soft};
                    --on:${info.on}
                "
            >

                <p class="card-label">
                    CPCB AQI (PM2.5 &amp; PM10 based)
                </p>

                <p class="aqi-number">
                    ${cpcbAQI}
                </p>

                <p class="aqi-category">
                    ${category}
                </p>

                <p class="summary">
                    ${safeArea}'s CPCB AQI is
                    ${cpcbAQI}, which falls under the
                    ${category} category.
                </p>

                ${scaleHTML(cpcbAQI)}

                <p class="muted small">
                    Calculated from PM2.5 and PM10 using
                    CPCB breakpoints. The official CPCB
                    index can also use other pollutants.
                </p>

            </section>`;


        meaningCard = `
            <section
                class="card meaning"
                style="--cat:${info.color}"
            >

                <h2>
                    What does this mean?
                </h2>

                <p>
                    ${info.meaning}
                </p>

                <p class="concern">
                    <b>Level of concern:</b>
                    ${info.concern}
                </p>

            </section>`;
    }


    const owValue =
        (typeof apiAQI === "number")
            ? `${apiAQI} / 5`
            : "Not available";


    el.innerHTML = `

        <div class="report">

            <header class="report-head">

                <p class="muted">
                    Air quality report
                </p>

                <h2>
                    ${safeArea}
                </h2>

            </header>


            ${mainCard}

            ${meaningCard}


            <h2 class="section-title">
                Pollutants
            </h2>

            <div class="pollutants">

                ${pollutantCard(
                    "PM2.5",
                    pm25,
                    "Fine particles that can enter deep into the lungs."
                )}

                ${pollutantCard(
                    "PM10",
                    pm10,
                    "Larger airborne particles that can affect the respiratory system."
                )}

            </div>


            <h2 class="section-title">
                OpenWeather data
            </h2>

            <section class="card ow">

                <p>
                    <b>OpenWeather AQI:</b>
                    ${owValue}
                </p>

                <p>
                    <b>OpenWeather Category:</b>
                    ${apiCategory}
                </p>

                <p class="muted">
                    OpenWeather uses a different 1–5 air-quality
                    scale, so its number is not the same as the
                    CPCB AQI (0–500). The two can give different
                    categories for the same air.
                </p>

            </section>

        </div>`;
}


// Start autocomplete (it also handles the Enter key)
document.addEventListener(
    "DOMContentLoaded",
    setupAutocomplete
);
