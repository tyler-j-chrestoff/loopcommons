# Story: Calibration Visualization

> As a **researcher (Tyler)**, I want to visualize calibration history so that I can understand how the amygdala prompt evolves over iterations — which edits helped, which were rejected, and whether the system is converging or plateauing.

## Acceptance Criteria

- `CalibrationHistory` component shows a timeline of all calibration iterations
- Each iteration displays: proposed edit summary, metrics before/after, keep/revert badge
- Convergence chart plots fitness score over iterations (line chart with kept/reverted markers)
- Metric breakdown view shows individual metrics (detection rate, FP rate, cost efficiency, simplicity) per iteration as overlaid lines or small multiples
- Reads from JSONL calibration log via API endpoint (`GET /api/metrics/calibration`)
- Integrated into Layout sidebar as a collapsible section (visible when calibration data exists)
- Component tests cover rendering with empty log, single iteration, and multi-iteration data

## Tasks

```jsonl
{"id":"cal-10","story":"calibration-viz","description":"Build the calibration log API endpoint (packages/web/src/app/api/metrics/calibration/route.ts). GET handler reads data/calibration/log.jsonl, parses each line, returns JSON array of iteration objects. Handle missing file gracefully (return empty array). Apply sanitization: strip any raw LLM response fields if present. Add types for CalibrationIteration in packages/web/src/lib/types.ts.","depends_on":["cal-07"],"requires":"","status":"pending"}
{"id":"cal-11","story":"calibration-viz","description":"Build the CalibrationHistory component (packages/web/src/components/CalibrationHistory.tsx). Fetches from /api/metrics/calibration on mount. Renders a vertical timeline of iterations: each row shows iteration number, timestamp, proposed edit summary (truncated to 120 chars with expand), a kept/reverted badge (green/red), and fitness score. Empty state: 'No calibration data yet — run npm run calibrate in packages/llm'. Loading and error states.","depends_on":["cal-10"],"requires":"","status":"pending"}
{"id":"cal-12","story":"calibration-viz","description":"Build the convergence chart (inline within CalibrationHistory). Line chart plotting fitness score (y-axis) over iteration number (x-axis). Kept iterations as solid dots, reverted as hollow/red dots. Use a lightweight charting approach consistent with existing viz (SVG path + circle elements, no heavy chart library). Show baseline as a dashed horizontal line. Tooltip on hover shows fitness score and edit summary.","depends_on":["cal-11"],"requires":"","status":"pending"}
{"id":"cal-13","story":"calibration-viz","description":"Build the metric breakdown view (expandable panel within CalibrationHistory). Four mini line charts or one multi-line chart showing detection_rate, fp_rate, cost_efficiency, and simplicity over iterations. Only show metrics from 'kept' iterations (the actual trajectory). Highlight the baseline value for each metric as a reference line. Color-code each metric consistently.","depends_on":["cal-11"],"requires":"","status":"pending"}
{"id":"cal-14","story":"calibration-viz","description":"Integrate CalibrationHistory into Layout sidebar (packages/web/src/components/Layout.tsx). Add as a collapsible section below existing panels. Only render when calibration data exists (check API response length > 0). Collapsed by default; shows iteration count and latest fitness score in the header.","depends_on":["cal-12","cal-13"],"requires":"","status":"pending"}
{"id":"cal-15","story":"calibration-viz","description":"Component tests (packages/web/test/calibration-viz.test.ts). Test CalibrationHistory rendering with: (1) empty log (shows empty state message), (2) single iteration (baseline only, no chart line), (3) 10 iterations with mix of kept/reverted (chart renders correct number of points, badges show correct colors, fitness values displayed). Mock the fetch call to /api/metrics/calibration. Test the API route handler with a fixture JSONL file.","depends_on":["cal-14"],"requires":"","status":"pending"}
```
