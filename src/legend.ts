import * as THREE from 'three';
import { POPULATION_CATEGORY } from "./helper";

export function createControlPanel() {
  const cpanel = document.createElement('div');
  cpanel.style.position = 'fixed';
  cpanel.style.fontFamily = 'Arial';
  cpanel.style.fontSize = '12px';
  cpanel.style.top = '30px';
  cpanel.style.left = '30px';
  cpanel.style.padding = '10px';
  cpanel.style.borderRadius = '5px';
  cpanel.style.zIndex = '10';
  document.body.appendChild(cpanel);
  return cpanel;
}

export function createToggle(cpanel: HTMLDivElement, labelText: string, targetGroup: THREE.Group, defaultValue = true) {
  targetGroup.visible = defaultValue;

  const label = document.createElement('label');
  Object.assign(label.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    userSelect: 'none'
  });

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = defaultValue;

  Object.assign(checkbox.style, {
    appearance: 'none',
    width: '14px',
    height: '14px',
    borderRadius: '3px',
    border: '1px solid #4da3ff',
    display: 'grid',
    placeContent: 'center',
    cursor: 'pointer'
  });

  checkbox.addEventListener('change', () => {
    targetGroup.visible = checkbox.checked;
    updateCheckboxStyle();
  });

  function updateCheckboxStyle() {
    if (checkbox.checked) {
      checkbox.style.backgroundColor = '#000';
      checkbox.style.borderColor = '#000';
      checkbox.style.backgroundRepeat = 'no-repeat';
      checkbox.style.backgroundPosition = 'center';
      checkbox.style.backgroundSize = '10px';
    } else {
      checkbox.style.backgroundColor = 'transparent';
      checkbox.style.backgroundImage = 'none';
    }
  }

  updateCheckboxStyle();

  const text = document.createElement('span');
  text.textContent = labelText;

  label.append(checkbox, text);
  cpanel.appendChild(label);
}


export function injectSliderStyles() {
  if (document.getElementById('modern-slider-style')) return;

  const style = document.createElement('style');
  style.id = 'modern-slider-style';
  style.textContent = `
    input[type="range"] {
      height: 24px;
    }

    /* Track */
    input[type="range"]::-webkit-slider-runnable-track {
      height: 4px;
      background: linear-gradient(
        to right,
        #000 var(--fill, 0%),
        rgba(255,255,255,0.2) var(--fill, 0%)
      );
      border-radius: 999px;
    }

    input[type="range"]::-moz-range-track {
      height: 4px;
      background: rgba(255,255,255,0.2);
      border-radius: 999px;
    }

    /* Thumb */
    input[type="range"]::-webkit-slider-thumb {
      appearance: none;
      width: 14px;
      height: 14px;
      background: #000;
      border-radius: 50%;
      margin-top: -5px;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }

    input[type="range"]::-moz-range-thumb {
      width: 14px;
      height: 14px;
      background: #000;
      border-radius: 50%;
      border: none;
    }

    input[type="range"]:hover::-webkit-slider-thumb {
      transform: scale(1.15);
      box-shadow: 0 0 0 6px rgba(48, 48, 48, 0.12);
    }

    input[type="range"]:active::-webkit-slider-thumb {
      transform: scale(1.25);
    }
  `;
  document.head.appendChild(style);
}


export function createRangeSlider({
  cpanel,
  min = 1960,
  max = 2024,
  step = 1,
  value = max,
  onChange
}: {
  cpanel: HTMLDivElement;
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  onChange?: (value: number) => void;
}) {
  const wrapper = document.createElement('div');

  Object.assign(wrapper.style, {
    position: 'relative',
    width: '100%',
    paddingTop: '24px'   // space for indicator
  });

  const slider = document.createElement('input');
  slider.type = 'range';

  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(value);

  Object.assign(slider.style, {
    width: '100%',
    appearance: 'none',
    background: 'transparent',
    cursor: 'pointer'
  });

  const indicator = document.createElement('div');
  indicator.textContent = slider.value;

  Object.assign(indicator.style, {
    position: 'absolute',
    top: '10px',
    transform: 'translateX(-50%)',
    background: '#000',
    color: '#fff',
    padding: '2px 6px',
    fontSize: '10px',
    borderRadius: '999px',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    transition: 'opacity 0.15s ease'
  });

  function update() {
    const minVal = Number(slider.min);
    const maxVal = Number(slider.max);
    const val = Number(slider.value);

    const percent = (val - minVal) / (maxVal - minVal);

    indicator.textContent = slider.value;
    indicator.style.left = `${percent * 100}%`;

    slider.style.setProperty('--fill', `${percent * 100}%`);

    onChange?.(val);
  }

  slider.addEventListener('input', update);

  // init
  update();

  wrapper.append(indicator, slider);
  cpanel.appendChild(wrapper);

  injectSliderStyles();
}


export function formatLegendPopulation(population: number) {
  const remainder = population / 1000;
  if (remainder < 1) {
    return `${remainder*1000}`;
  } 
  else if (remainder < 1000) {
    return `${remainder} K`;
  } else if (remainder > 999 && remainder < 1000_000) {
    return `${remainder / 1000} M`;
  } else {
    return `${remainder / 1000_000} B`
  }
}


export function createPopulationLegend() {

  const mainContainer = document.createElement('div');

  const legendContainer = document.createElement('div');

  Object.assign(mainContainer.style, {
    position: 'fixed',
    bottom: '30px',
    left: '30px',

    maxWidth: '300px',
    fontSize: '12px'
  });

  Object.assign(legendContainer.style, {
    display: 'flex',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  });

  const legendTitle = document.createElement('p');
  legendTitle.style.fontSize = '20px';
  legendTitle.textContent = 'Population';

  mainContainer.appendChild(legendTitle);

  POPULATION_CATEGORY.forEach(category => {
    const categoryContainer = document.createElement('div');

    Object.assign(categoryContainer.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      width: 'auto',            // ← full width row
      flexBasis: '30%'
    });

    const categoryColor = document.createElement('span');
    Object.assign(categoryColor.style, {
      backgroundColor: category.color,
      width: '10px',
      height: '10px',
      display: 'inline-block',
      flexShrink: '0'
    });

    const categoryLabel = document.createElement('span');
    categoryLabel.textContent =
      `${formatLegendPopulation(category.min)} - ${formatLegendPopulation(category.max)}`;

    categoryContainer.append(categoryColor, categoryLabel);
    legendContainer.appendChild(categoryContainer);
  });

  mainContainer.appendChild(legendContainer);

  document.body.appendChild(mainContainer);
}