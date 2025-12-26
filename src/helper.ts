import type { Vec3 } from "./types";
import * as THREE from 'three';

export function randomColor(): string {
  return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
}

export function latLonToSphere(lat: number, lon: number): Vec3 {
  const φ = THREE.MathUtils.degToRad(lat);
  const λ = THREE.MathUtils.degToRad(lon);
  return {
    x: Math.cos(φ) * Math.cos(λ),
    y: Math.cos(φ) * Math.sin(λ),
    z: Math.sin(φ)
  };
}

function cleanCell(cell: string) {
  return cell
    .replace(/^"+|"+$/g, '')   // remove outer quotes
    .replace(/\\"/g, '"');     // unescape quotes
}

export async function loadCSV(url: string) {
  const res = await fetch(url);
  const text = await res.text();

  const rows = text
    .split('\n')
    .map(r => r.split(',').map(cleanCell));

  return rows;
}

function parsePopulationToNumber(population: string) {
  return Number(population);
}

export const POPULATION_CATEGORY = [
  {
    min: 0,
    max: 500_000,
    color: '#f9e5e5'
  },
  {
    min: 500_000,
    max: 1_000_000,
    color: '#f4cccc'
  },
  {
    min: 1_000_000,
    max: 5_000_000,
    color: '#efb2b2'
  },
  {
    min: 5_000_000,
    max: 10_000_000,
    color: '#ea9999'
  },
  {
    min: 10_000_000,
    max: 50_000_000,
    color: '#e57f7f'
  },
  {
    min: 50_000_000,
    max: 100_000_000,
    color: '#e06666'
  },
  {
    min: 100_000_000,
    max: 200_000_000,
    color: '#db4c4c'
  },
  {
    min: 200_000_000,
    max: 500_000_000,
    color: '#d63232'
  },
  {
    min: 500_000_000,
    max: 100_000_000_000,
    color: '#cc0000'
  },
];


const EXCLUDED_DATAPOINTS = [
  'World',
  'Sub-Saharan Africa (excluding high income)',
  'Post-demographic dividend',
  'Not classified',
  'Upper middle income',
  'Sub-Saharan Africa',
  'Latin America & Caribbean (excluding high income)',
  'Sub-Saharan Africa (IDA & IBRD countries)',
  'IDA total',
  'South Asia (IDA & IBRD)',
  'Lower middle income',
  'Central Europe and the Baltics',
  'Africa Western and Central',
  'IDA only',
  'Fragile and conflict affected situations',
  'IDA blend',
  'Low & middle income',
  'IDA & IBRD total',
  'Low income',
  'Late-demographic dividend',
  'Latin America & the Caribbean (IDA & IBRD countries)',
  'Europe & Central Asia (IDA & IBRD countries)',
  'East Asia & Pacific (IDA & IBRD countries)',
  'IBRD only',
  'Least developed countries: UN classification',
  'Pre-demographic dividend',
  'Middle income',
  'European Union',
  'East Asia & Pacific (excluding high income)',
  'Early-demographic dividend',
  'East Asia & Pacific',
  'Europe & Central Asia',
  'Euro area',
  'High income',
  'Heavily indebted poor countries (HIPC)',
  'Latin America & Caribbean',
  'Middle East',
  'OECD members',
  'South Asia',
  'Small states',
  'North America',
  'Africa Eastern and Southern',
  'Europe & Central Asia (excluding high income)'
];

const CORRECTED_NAMES: Record<string, string> = {
  'United States': 'United States of America',
  'Russian Federation': 'Russia',
  'Central African Republic': 'Central African Rep.',
  "Cote d'Ivoire": "Côte d'Ivoire",
  'Syrian Arab Republic': 'Syria',
  'Turkiye': 'Turkey',
  'Kyrgyz Republic': 'Kyrgyzstan',
  'Viet Nam': 'Vietnam',
  'Lao PDR': 'Laos',
  'Dominican Republic': 'Dominican Rep.',
  'Slovak Republic': 'Slovakia',
  'Bosnia and Herzegovina': 'Bosnia and Herz.',
  'Solomon Islands': 'Solomon Is.'
};

export function heatMapColor(
  population: number,
): string {
  const category = POPULATION_CATEGORY.find(cat => (cat.min < population) && (cat.max > population))
  return category?.color || '#ffffff';
}

export function formatPopulationData(rows: string[][]) {
  const title = `${rows[0][0]} ${rows[0][1]}`;
  const lastUpdated = `${rows[2][0]} ${rows[2][1]}`;
  const data: { title: string, lastUpdated: string, countries: Record<string, Record<string, { population: number, color: string }>> } = {
    title,
    lastUpdated,
    countries: {}
  };
  // create country object using the csv data
  for (let i = 0; i < rows.length; i++) {
    if (i < 5) continue;
    let countryName = rows[i][0];
    if (EXCLUDED_DATAPOINTS.includes(countryName)) continue;
    // rename label from populationJSON to match GeoJSON label
    if (countryName in CORRECTED_NAMES) {
      countryName = CORRECTED_NAMES[countryName];
    }

    if (countryName === 'Korea') {
      if (rows[i][2] === 'PRK') {
        countryName = 'North Korea';
      } else {
        countryName = 'South Korea';
      }
    }

    const countryData: Record<string, { population: number, color: string }> = {};
    for (let j = 0; j < rows[4].length; j++) {
      if (j > 3) {
        // polulation data
        const population = parsePopulationToNumber(rows[i][j + 1]);
        const year = rows[4][j];
        if (!year.trim()) continue;
        countryData[year] = { population, color: '' };
      }
    }
    data.countries[countryName] = countryData;
  }

  for (const key in data.countries) {
    for (const year in data.countries[key]) {
      const color = heatMapColor((data.countries[key][year] as { population: number, color: string }).population);
      (data.countries[key][year] as { population: number, color: string }).color = color;
    }
  }

  return data;
}