/**
 * Web Demo Server for Oddo Language Parser
 * Serves a web page with textarea for Oddo code input and AST output
 */

import { createServer } from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseOddo, parseOddoExpression } from './index.mjs';
import { compileToJS } from './compiler.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;

// HTML page with embedded CSS and JavaScript
const htmlPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Oddo Language Parser Demo</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 0;
      margin: 0;
    }

    .container {
      margin: 0 auto;
      background: white;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }

    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }

    .header h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
      font-weight: 700;
    }

    .header p {
      opacity: 0.9;
      font-size: 1.1em;
    }

    .content {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
      min-height: 600px;
    }

    @media (max-width: 968px) {
      .content {
        grid-template-columns: 1fr;
      }
    }

    .panel {
      padding: 30px;
      border-right: 1px solid #e0e0e0;
      display: flex;
      flex-direction: column;
    }

    .panel:last-child {
      border-right: none;
    }

    .panel-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .panel h2 {
      margin-bottom: 20px;
      color: #333;
      font-size: 1.5em;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .panel h2::before {
      content: '';
      width: 4px;
      height: 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 2px;
    }

    textarea {
      width: 100%;
      flex: 1;
      min-height: 0;
      padding: 15px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 14px;
      line-height: 1.6;
      resize: none;
      transition: border-color 0.3s;
    }

    textarea:focus {
      outline: none;
      border-color: #667eea;
    }

    .controls {
      margin-top: 15px;
      display: flex;
      gap: 10px;
      align-items: center;
    }

    button {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);
    }

    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 12px rgba(102, 126, 234, 0.4);
    }

    button:active {
      transform: translateY(0);
    }

    .parse-mode {
      display: flex;
      gap: 10px;
      align-items: center;
      width: 100%;
    }

    .parse-mode label {
      display: flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      font-size: 14px;
      color: #666;
    }

    .parse-mode input[type="radio"] {
      cursor: pointer;
    }

    .output-mode {
      display: flex;
      gap: 10px;
      align-items: center;
      margin-bottom: 15px;
      padding-bottom: 15px;
      border-bottom: 1px solid #eee;
    }

    .output-mode label {
      display: flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      font-size: 0.95em;
      color: #555;
    }

    .output-mode input[type="radio"] {
      cursor: pointer;
    }

    #output {
      width: 100%;
      flex: 1;
      min-height: 0;
      padding: 15px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 14px;
      line-height: 1.6;
      background: #f8f9fa;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow: auto;
      resize: none;
    }

    .placeholder {
      color: #666;
    }

    .error {
      color: #d32f2f;
      background: #ffebee;
      padding: 15px;
      border-radius: 6px;
      border-left: 4px solid #d32f2f;
      margin-top: 10px;
    }

    .success {
      color: #2e7d32;
      background: #e8f5e9;
      padding: 15px;
      border-radius: 6px;
      border-left: 4px solid #2e7d32;
      margin-top: 10px;
    }

    .stats {
      margin-top: 15px;
      padding: 15px;
      background: #f5f5f5;
      border-radius: 6px;
      font-size: 14px;
      color: #666;
    }

    .stats span {
      margin-right: 20px;
    }

    .example-code {
      margin: 15px 0;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 6px;
      font-size: 13px;
    }

    .example-code h3 {
      margin-bottom: 10px;
      color: #333;
      font-size: 14px;
    }

    .example-code code {
      display: block;
      padding: 10px;
      background: white;
      border-radius: 4px;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 12px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .example-code code:hover {
      background: #e3f2fd;
    }
    #exampleSelect {
      padding: 10px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      font-size: 14px;
      background: #fff;
      color: #666;
      width: 100%;
      height: 40px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚀 Oddo Language Parser</h1>
      <p>Parse Oddo language code and view the Abstract Syntax Tree (AST)</p>
    </div>

    <div class="content">
      <div class="panel">
        <h2>Input</h2>

        <div class="panel-content">
          <div class="example-code">
            <h3>💡 Example Code:</h3>
            <select id="exampleSelect" onchange="if(typeof window.loadExampleFromSelect === 'function') window.loadExampleFromSelect()">
              <option value="">-- Select an example --</option>
              <option value="// All primitive types&#10;42&#10;&quot;hello&quot;&#10;true&#10;false&#10;null">Primitive Literals</option>
              <option value="// Array with spread&#10;[1, 2, 3, ...arr, 4]&#10;&#10;// Empty array&#10;[]">Arrays</option>
              <option value="// All slice patterns and assignment&#10;start = numbers[0...2]&#10;middle = numbers[3...-2]&#10;end = numbers[-2...]&#10;copy = numbers[...]&#10;arr[3...6] := [-3, -4, -5, -6]">Array Slices</option>
              <option value="// All object features (static, shorthand, computed, spread)&#10;{ name: &quot;test&quot;, value: 42, shorthand, [computed]: &quot;value&quot;, ...obj }&#10;&#10;// Empty object&#10;{}">Objects</option>
              <option value="// Single parameter&#10;x => x + 1&#10;&#10;// Multi-parameter&#10;(x, y) => x + y&#10;&#10;// With rest parameter&#10;(a, ...rest) => rest&#10;&#10;// With block body&#10;fn = arg => {&#10;  x := arg * 2&#10;  return x&#10;}">Arrow Functions</option>
              <option value="// Array and object destructuring&#10;[a, b, ...rest] = arr&#10;{ a, b: x } = obj">Destructuring</option>
              <option value="// Arithmetic operators&#10;1 + 2 * 3 - 4 / 5&#10;&#10;// Logical and nullish coalescing&#10;x && y || z ?? w&#10;&#10;// Comparison operators&#10;x == y && a != b&#10;&#10;// Conditional (ternary)&#10;x ? y : z&#10;&#10;// Exponentiation&#10;x ** 2&#10;&#10;// Pipe and compose operators&#10;a |> b |> c&#10;a <| b <| c">Operators</option>
              <option value="// Member access (dot, bracket, nested)&#10;obj.property&#10;obj[&quot;key&quot;]&#10;arr[0].value&#10;&#10;// Function calls with spread&#10;fn(1, 2, ...args)">Member Access &amp; Calls</option>
              <option value="// Element with attributes and children&#10;&lt;div className=&quot;test&quot; data-value={42}&gt;Hello {name}&lt;/div&gt;&#10;&#10;// Self-closing with spread&#10;&lt;div {...props} /&gt;">JSX</option>
              <option value="// Declarations (using =)&#10;x = 3&#10;y = &quot;hello&quot;&#10;z = [1, 2, 3]&#10;&#10;// Assignments (using :=)&#10;x := 3&#10;y := &quot;hello&quot;&#10;z := [1, 2, 3]&#10;&#10;// Member access assignments (using :=)&#10;obj.prop := 42&#10;arr[0] := 10&#10;obj.nested.value := &quot;test&quot;&#10;&#10;// All assignment operators&#10;x := 1&#10;x +:= 2&#10;x -:= 1&#10;x *:= 3&#10;x /:= 2&#10;x %:= 5&#10;x **:= 2&#10;x &amp;:= 0xFF&#10;x |:= 0x0F&#10;x ^:= 0xAA&#10;x &lt;&lt;:= 2&#10;x &gt;&gt;:= 1&#10;x &gt;&gt;&gt;:= 1">Declarations vs Assignments</option>
              <option value="// Simple program&#10;x = 10&#10;y = 20&#10;return x + y">Statements &amp; Blocks</option>
              <option value="// All modifier types&#10;@state x = 3&#10;@computed: {&#10;  y = 3 + x&#10;  z = y * 2&#10;}&#10;@computed return x + y">Modifiers</option>
              <option value="// Named export (assignment)&#10;export x = 1&#10;&#10;// Named export (list)&#10;export { x, y }&#10;&#10;// Renamed export&#10;export { x as y }&#10;&#10;// Default export&#10;export default 42">Exports</option>
              <option value="// Named imports&#10;import { x, y } from &quot;module&quot;&#10;&#10;// Renamed import&#10;import { x as y } from &quot;module&quot;&#10;&#10;// Default import&#10;import x from &quot;module&quot;&#10;&#10;// Mixed import&#10;import x, { y } from &quot;module&quot;&#10;&#10;// Namespace import&#10;import * as ns from &quot;module&quot;">Imports</option>
              <option value="// Line break in parentheses&#10;(a + b&#10;  + c)&#10;&#10;// Multi-line expression&#10;x = (a + b&#10;  + c)&#10;&#10;// Complex destructuring and spread&#10;[a, b, ...rest] = arr&#10;fn(...args)">Advanced</option>
            </select>
            <div class="controls">
              <div class="parse-mode">
                <label>
                  <input type="radio" name="mode" value="program" checked>
                  Program
                </label>
                <label>
                  <input type="radio" name="mode" value="expression">
                  Expression
                </label>
                <span style="flex: 1;"></span>
                <button onclick="if(typeof window.parseCode === 'function') window.parseCode()">Parse</button>
              </div>
            </div>
          </div>
          <textarea id="input" placeholder="Enter Oddo language code here..."></textarea>
        </div>
      </div>
            <div class="panel">
              <h2>Output</h2>
              <div class="panel-content">
                <div class="output-mode">
                  <label>
                    <input type="radio" name="outputMode" value="ast" checked>
                    AST
                  </label>
                  <label>
                    <input type="radio" name="outputMode" value="js">
                    JavaScript
                  </label>
                </div>
                <div id="output">AST will appear here...</div>
                <div id="stats" class="stats" style="display: none;"></div>
              </div>
            </div>
    </div>
  </div>

  <script>
    // Define parseCode first since loadExampleFromSelect needs it
    async function parseCode() {
      const input = document.getElementById('input').value;
      const output = document.getElementById('output');
      const stats = document.getElementById('stats');
      const mode = document.querySelector('input[name="mode"]:checked').value;
      const outputMode = document.querySelector('input[name="outputMode"]:checked').value;

      if (!input.trim()) {
        output.innerHTML = '<div class="placeholder">Please enter some code to parse.</div>';
        stats.style.display = 'none';
        return;
      }

      try {
        const startTime = performance.now();
        const response = await fetch('/parse', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code: input, mode, outputMode }),
        });

        const result = await response.json();
        const endTime = performance.now();
        const parseTime = (endTime - startTime).toFixed(2);

        if (result.error) {
          output.innerHTML = '<div class="error"><strong>Parse Error:</strong><br>' +
            result.error.replace(/\\n/g, '<br>') + '</div>';
          stats.style.display = 'none';
        } else {
          if (outputMode === 'js') {
            // Display JavaScript output
            output.textContent = result.js || 'No JavaScript output available';
            output.className = '';
          } else {
            // Display AST
            const astJson = JSON.stringify(result.ast, null, 2);
            output.textContent = astJson;
            output.className = '';
          }

          // Calculate stats
          const astSize = JSON.stringify(result.ast).length;
          const nodeCount = countNodes(result.ast);

          stats.innerHTML = '<span>⏱️ Parse time: ' + parseTime + 'ms</span>' +
            '<span>📊 AST size: ' + formatBytes(astSize) + '</span>' +
            '<span>🔢 Nodes: ' + nodeCount + '</span>' +
            (outputMode === 'js' && result.js ? '<span>📝 JS size: ' + formatBytes(result.js.length) + '</span>' : '');
          stats.style.display = 'block';
        }
      } catch (error) {
        output.innerHTML = '<div class="error"><strong>Error:</strong><br>' +
          error.message + '</div>';
        stats.style.display = 'none';
      }
    }

    function countNodes(obj) {
      if (obj === null || typeof obj !== 'object') return 0;
      let count = 1;
      for (const key in obj) {
        if (Array.isArray(obj[key])) {
          count += obj[key].reduce((sum, item) => sum + countNodes(item), 0);
        } else if (typeof obj[key] === 'object') {
          count += countNodes(obj[key]);
        }
      }
      return count;
    }

    function formatBytes(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function loadExample(code) {
      // Decode HTML entities if present
      const textarea = document.createElement('textarea');
      textarea.innerHTML = code;
      const decodedCode = textarea.value || code;
      document.getElementById('input').value = decodedCode;
      parseCode();
    }

    // Make parseCode globally accessible for inline handlers (must be before loadExampleFromSelect)
    window.parseCode = parseCode;

    // Define loadExampleFromSelect function - must be available before any inline handlers
    window.loadExampleFromSelect = function loadExampleFromSelect() {
      const select = document.getElementById('exampleSelect');
      if (!select) return;

      const selectedValue = select.value;

      // Don't load if placeholder or empty value is selected
      if (!selectedValue || selectedValue.trim() === '') {
        return;
      }

      // Decode HTML entities properly
      const textarea = document.createElement('textarea');
      textarea.innerHTML = selectedValue;
      const code = textarea.value || selectedValue;

      document.getElementById('input').value = code;
      parseCode();
    };

    // Attach event listener to select dropdown (script runs after DOM is parsed)
    const exampleSelect = document.getElementById('exampleSelect');
    if (exampleSelect) {
      exampleSelect.addEventListener('change', window.loadExampleFromSelect);
    }

    // Auto-parse on Enter (Ctrl/Cmd + Enter)
    document.getElementById('input').addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        parseCode();
      }
    });

    // Re-parse when output mode changes
    document.querySelectorAll('input[name="outputMode"]').forEach(radio => {
      radio.addEventListener('change', parseCode);
    });

    // Initial parse
    parseCode();
  </script>
</body>
</html>`;

// Create HTTP server
const server = createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/' || req.url === '/index.html') {
    // Serve HTML page
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(htmlPage);
  } else if (req.url === '/parse' && req.method === 'POST') {
    // Parse endpoint
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

      req.on('end', () => {
        try {
          const { code, mode, outputMode } = JSON.parse(body);

        let ast;
        // Auto-detect: if code contains multiple lines with content, use program mode
        const lines = code.split('\n').filter(line => line.trim().length > 0);
        const shouldUseProgramMode = mode === 'program' || (mode === 'expression' && lines.length > 1);

        if (shouldUseProgramMode) {
          ast = parseOddo(code);
        } else {
          ast = parseOddoExpression(code);
        }

        let js = null;
        if (outputMode === 'js') {
          try {
            if (shouldUseProgramMode) {
              js = compileToJS(ast);
            } else {
              // Wrap expression in a program for compilation
              const programAST = {
                type: 'program',
                body: [{
                  type: 'expressionStatement',
                  modifier: null,
                  expression: ast,
                  block: null,
                }],
              };
              js = compileToJS(programAST);
            }
          } catch (compileError) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: `Compilation error: ${compileError.message}`,
              ast
            }));
            return;
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ast, js }));
      } catch (error) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: error.message,
          stack: error.stack
        }));
      }
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 Oddo Language Parser Web Demo');
  console.log('='.repeat(60));
  console.log(`\n📡 Server running at: http://localhost:${PORT}`);
  console.log(`\n💡 Open your browser and navigate to the URL above`);
  console.log(`\nPress Ctrl+C to stop the server\n`);
});
