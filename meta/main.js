import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

// Scales live out here (not inside renderScatterPlot) so the brush
// functions can use them too (Step 5.4)
let xScale;
let yScale;
// Lab 8: radius scale is built once from ALL commits, so a commit keeps
// the same size while the time filter changes
let rScale;

// Shared chart size (used by renderScatterPlot and updateScatterPlot)
const width = 1000;
const height = 600;
// Extra room on the left/bottom for the bigger axis labels
const margin = { top: 10, right: 10, bottom: 50, left: 70 };
const usableArea = {
  top: margin.top,
  right: width - margin.right,
  bottom: height - margin.bottom,
  left: margin.left,
  width: width - margin.left - margin.right,
  height: height - margin.top - margin.bottom,
};

// ---------- Step 1.1: read the CSV ----------
async function loadData() {
  const data = await d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line), // or just +row.line
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
  }));

  return data;
}

// ---------- Step 1.2: one object per commit ----------
function processCommits(data) {
  return d3
    .groups(data, (d) => d.commit)
    .map(([commit, lines]) => {
      let first = lines[0];
      let { author, date, time, timezone, datetime } = first;
      let ret = {
        id: commit,
        url: 'https://github.com/macblair221/portfolio/commit/' + commit,
        author,
        date,
        time,
        timezone,
        datetime,
        // e.g. 2:30 PM = 14.5
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length,
      };

      // Keep the raw lines, but hidden so console.log stays readable
      Object.defineProperty(ret, 'lines', {
        value: lines,
        enumerable: false, // hidden from console.log and loops
        writable: false, // can't be reassigned
        configurable: false, // can't be deleted or redefined
      });

      return ret;
    })
    // Oldest first, so the story and the time filter go in order
    .sort((a, b) => a.datetime - b.datetime);
}

// ---------- Step 1.3: summary stats ----------
function renderCommitInfo(data, commits) {
  // Clear old stats first, so this can re-run when the filter changes
  d3.select('#stats').html('');
  const dl = d3.select('#stats').append('dl').attr('class', 'stats');

  // Total LOC
  dl.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
  dl.append('dd').text(data.length);

  // Total commits
  dl.append('dt').text('Total commits');
  dl.append('dd').text(commits.length);

  // Number of files (distinct values)
  dl.append('dt').text('Files');
  dl.append('dd').text(d3.group(data, (d) => d.file).size);

  // Average file length (grouped aggregate)
  const fileLengths = d3.rollups(
    data,
    (v) => d3.max(v, (v) => v.line),
    (d) => d.file,
  );
  dl.append('dt').text('Avg file length');
  dl.append('dd').text(Math.round(d3.mean(fileLengths, (d) => d[1])));

  // Max depth (aggregate over the whole dataset)
  dl.append('dt').text('Max depth');
  dl.append('dd').text(d3.max(data, (d) => d.depth));

  // Time of day most work is done (min/max value)
  const workByPeriod = d3.rollups(
    data,
    (v) => v.length,
    (d) => new Date(d.datetime).toLocaleString('en', { dayPeriod: 'short' }),
  );
  const maxPeriod = d3.greatest(workByPeriod, (d) => d[1])?.[0];
  dl.append('dt').text('Most work done');
  dl.append('dd').text(maxPeriod);
}

// ---------- Step 2: scatterplot ----------
function renderScatterPlot(data, commits) {
  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  // Gridlines first, so they sit behind everything else
  const gridlines = svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`);
  gridlines.call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

  // Step 4: dot size = lines edited (sqrt so AREA matches the count)
  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);

  // Big dots first, small dots on top so small ones stay hoverable
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  const dots = svg.append('g').attr('class', 'dots');

  drawDots(dots, sortedCommits);

  // Axes
  const xAxis = d3.axisBottom(xScale);
  const yAxis = d3
    .axisLeft(yScale)
    .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');

  svg
    .append('g')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .attr('class', 'x-axis') // Lab 8: so updateScatterPlot can find it
    .call(xAxis);

  svg
    .append('g')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .attr('class', 'y-axis') // just for consistency
    .call(yAxis);

  createBrushSelector(svg);
}

// Draw or update the dots. The key (d.id) tells D3 which circle belongs
// to which commit, so circles move smoothly instead of swapping (Step 1.3)
function drawDots(dots, sortedCommits) {
  dots
    .selectAll('circle')
    .data(sortedCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .style('--r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });
}

// ---------- Lab 8, Step 1.2: update the existing chart ----------
function updateScatterPlot(data, commits) {
  const svg = d3.select('#chart').select('svg');

  // Stretch the x axis over just the commits being shown
  let [minDate, maxDate] = d3.extent(commits, (d) => d.datetime);
  if (+minDate === +maxDate) {
    // Only one commit: give the axis a day on each side so it has a range
    minDate = d3.timeDay.offset(minDate, -1);
    maxDate = d3.timeDay.offset(maxDate, 1);
  }
  xScale = xScale.domain([minDate, maxDate]).nice();

  // Redraw the x axis in place instead of adding a new one
  const xAxisGroup = svg.select('g.x-axis');
  xAxisGroup.selectAll('*').remove();
  xAxisGroup.call(d3.axisBottom(xScale));

  const dots = svg.select('g.dots');
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);
  drawDots(dots, sortedCommits);
}

// ---------- Step 3: tooltip ----------
function renderTooltipContent(commit) {
  const link = document.getElementById('commit-link');
  const date = document.getElementById('commit-date');
  const time = document.getElementById('commit-clock');
  const author = document.getElementById('commit-author');
  const lines = document.getElementById('commit-lines');

  if (Object.keys(commit).length === 0) return;

  link.href = commit.url;
  link.textContent = commit.id;
  date.textContent = commit.datetime?.toLocaleString('en', {
    dateStyle: 'full',
  });
  time.textContent = commit.datetime?.toLocaleString('en', {
    timeStyle: 'short',
  });
  author.textContent = commit.author;
  lines.textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  // Small offset so the tooltip doesn't sit right under the cursor
  tooltip.style.left = `${event.clientX + 10}px`;
  tooltip.style.top = `${event.clientY + 10}px`;
}

// ---------- Step 5: brushing ----------
function createBrushSelector(svg) {
  svg.call(d3.brush().on('start brush end', brushed));

  // The brush adds an invisible overlay that eats mouse events.
  // Move the dots (and anything after the overlay) back on top of it.
  svg.selectAll('.dots, .overlay ~ *').raise();
}

function brushed(event) {
  const selection = event.selection;
  d3.selectAll('circle').classed('selected', (d) =>
    isCommitSelected(selection, d),
  );
  renderSelectionCount(selection);
  renderLanguageBreakdown(selection);
}

function isCommitSelected(selection, commit) {
  if (!selection) {
    return false;
  }
  // selection = [[x0, y0], [x1, y1]] in pixels (top-left, bottom-right)
  const [[x0, y0], [x1, y1]] = selection;
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function renderSelectionCount(selection) {
  const selectedCommits = selection
    ? filteredCommits.filter((d) => isCommitSelected(selection, d))
    : [];

  const countElement = document.querySelector('#selection-count');
  countElement.textContent = `${
    selectedCommits.length || 'No'
  } commits selected`;

  return selectedCommits;
}

function renderLanguageBreakdown(selection) {
  const selectedCommits = selection
    ? filteredCommits.filter((d) => isCommitSelected(selection, d))
    : [];
  const container = document.getElementById('language-breakdown');

  if (selectedCommits.length === 0) {
    container.innerHTML = '';
    return;
  }
  const requiredCommits = selectedCommits.length ? selectedCommits : commits;
  const lines = requiredCommits.flatMap((d) => d.lines);

  // Count lines per language
  const breakdown = d3.rollup(
    lines,
    (v) => v.length,
    (d) => d.type,
  );

  container.innerHTML = '';

  for (const [language, count] of breakdown) {
    const proportion = count / lines.length;
    const formatted = d3.format('.1~%')(proportion);

    container.innerHTML += `
            <dt>${language}</dt>
            <dd>${count} lines (${formatted})</dd>
        `;
  }
}

// ---------- Lab 8, Step 2: unit visualization of files ----------
const colors = d3.scaleOrdinal(d3.schemeTableau10);

function updateFileDisplay(filteredCommits) {
  // Every line from the shown commits, grouped by file, biggest file first
  let lines = filteredCommits.flatMap((d) => d.lines);
  let files = d3
    .groups(lines, (d) => d.file)
    .map(([name, lines]) => {
      return { name, lines };
    })
    .sort((a, b) => b.lines.length - a.lines.length);

  let filesContainer = d3
    .select('#files')
    .selectAll('div')
    .data(files, (d) => d.name)
    .join(
      // This code only runs when the div is initially rendered
      (enter) =>
        enter.append('div').call((div) => {
          div.append('dt');
          div.append('dd');
        }),
    );

  // This code updates the div info
  filesContainer
    .select('dt')
    .html((d) => `<code>${d.name}</code><small>${d.lines.length} lines</small>`);

  // One dot per line of code, colored by language
  filesContainer
    .select('dd')
    .selectAll('div')
    .data((d) => d.lines)
    .join('div')
    .attr('class', 'loc')
    .attr('style', (d) => `--color: ${colors(d.type)}`);
}

// ---------- Run it ----------
let data = await loadData();
let commits = processCommits(data);

// ---------- Lab 8, Step 1.1: time filter ----------
let commitProgress = 100;

let timeScale = d3
  .scaleTime()
  .domain([
    d3.min(commits, (d) => d.datetime),
    d3.max(commits, (d) => d.datetime),
  ])
  .range([0, 100]);
let commitMaxTime = timeScale.invert(commitProgress);

// Will get updated as user changes slider
let filteredCommits = commits;

renderCommitInfo(data, commits);
renderScatterPlot(data, commits);

const slider = document.getElementById('commit-progress');
const commitTimeEl = document.getElementById('commit-time');

// Show only commits up to commitMaxTime: slider label, stats, chart, files
function updateTimeFilter() {
  commitTimeEl.textContent = commitMaxTime.toLocaleString('en', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);

  renderCommitInfo(
    filteredCommits.flatMap((d) => d.lines),
    filteredCommits,
  );
  updateScatterPlot(data, filteredCommits);
  updateFileDisplay(filteredCommits);
}

function onTimeSliderChange() {
  commitProgress = Number(slider.value);
  commitMaxTime = timeScale.invert(commitProgress);
  updateTimeFilter();
}

slider.addEventListener('input', onTimeSliderChange);
onTimeSliderChange();

// ---------- Lab 8, Step 3: scrollytelling ----------
// "1 file" / "4 files"
function fileCount(commit) {
  const n = d3.rollups(
    commit.lines,
    (D) => D.length,
    (d) => d.file,
  ).length;
  return `${n} ${n === 1 ? 'file' : 'files'}`;
}

d3.select('#scatter-story')
  .selectAll('.step')
  .data(commits)
  .join('div')
  .attr('class', 'step')
  .html(
    (d, i) => `
      On ${d.datetime.toLocaleString('en', {
        dateStyle: 'full',
        timeStyle: 'short',
      })},
      I made <a href="${d.url}" target="_blank">${
        i > 0 ? 'another commit' : 'my first commit'
      }</a>.
      I edited ${d.totalLines} lines across ${fileCount(d)}.
    `,
  );

// When a commit's text crosses the middle of the screen, show the repo
// as it was at that commit (and move the slider to match)
function onStepEnter(response) {
  commitMaxTime = response.element.__data__.datetime;
  commitProgress = timeScale(commitMaxTime);
  slider.value = commitProgress;
  updateTimeFilter();
}

const scroller = scrollama();
scroller
  .setup({
    container: '#scrolly-1',
    step: '#scrolly-1 .step',
  })
  .onStepEnter(onStepEnter);
