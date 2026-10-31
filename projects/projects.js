import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { fetchJSON, renderProjects } from '../global.js';

const projects = await fetchJSON('../lib/projects.json');
const projectsContainer = document.querySelector('.projects');

// Lab 4, Step 1.6: show how many projects there are in the page title
const projectsTitle = document.querySelector('.projects-title');
projectsTitle.textContent = `${projects?.length ?? 0} Projects`;

// ---------- Filter state ----------
// Both filters are remembered here so they can be combined (Step 5.4 fix)
let query = '';           // text in the search bar
let selectedYear = null;  // year of the clicked wedge, null = nothing selected

// Projects that match the search bar only
function searchProjects() {
  return projects.filter((project) => {
    let values = Object.values(project).join('\n').toLowerCase();
    return values.includes(query.toLowerCase());
  });
}

// Projects that match the search bar AND the selected year
function filterProjects() {
  let filtered = searchProjects();
  if (selectedYear !== null) {
    filtered = filtered.filter((project) => project.year === selectedYear);
  }
  return filtered;
}

// ---------- Pie chart + legend (Steps 1 to 5) ----------
const colors = d3.scaleOrdinal(d3.schemeTableau10);

function renderPieChart(projectsGiven) {
  // Count projects per year: [['2026', 8], ['2025', 2], ...]
  let rolledData = d3.rollups(
    projectsGiven,
    (v) => v.length,
    (d) => d.year,
  );
  let data = rolledData.map(([year, count]) => {
    return { value: count, label: year };
  });

  // Turn the counts into wedge angles, then into SVG path strings
  let arcGenerator = d3.arc().innerRadius(0).outerRadius(50);
  let sliceGenerator = d3.pie().value((d) => d.value);
  let arcData = sliceGenerator(data);
  let arcs = arcData.map((d) => arcGenerator(d));

  // Clear the old wedges and legend items before drawing new ones
  let svg = d3.select('#projects-pie-plot');
  let legend = d3.select('.legend');
  svg.selectAll('path').remove();
  legend.selectAll('li').remove();

  arcs.forEach((arc, i) => {
    svg
      .append('path')
      .attr('d', arc)
      .attr('fill', colors(data[i].label))
      .attr('class', data[i].label === selectedYear ? 'selected' : '')
      .on('click', () => selectYear(data[i].label));
  });

  data.forEach((d) => {
    legend
      .append('li')
      .attr('style', `--color:${colors(d.label)}`)
      .attr('class', d.label === selectedYear ? 'legend-item selected' : 'legend-item')
      .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`)
      .on('click', () => selectYear(d.label));
  });
}

// Click a wedge to select its year, click it again to deselect
function selectYear(year) {
  selectedYear = selectedYear === year ? null : year;
  update();
}

// Redraw everything from the current filter state
function update() {
  // The pie shows the search results, so every year stays clickable
  renderPieChart(searchProjects());
  // The list shows projects that pass both filters
  renderProjects(filterProjects(), projectsContainer, 'h2');
}

// Draw once on page load
update();

// ---------- Search (Step 4) ----------
let searchInput = document.querySelector('.searchBar');

searchInput.addEventListener('input', (event) => {
  query = event.target.value;
  update();
});
