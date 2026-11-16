/* EE211 Study Site — circuit & oscilloscope SVG renderer.
 * Circuit spec: {parts:[...], unit?:40, scale?:1, pad?:0.9}
 * Coordinates are in grid units (1 unit = 40 px by default); y grows downward.
 * See AUTHORING.md for the full part reference.
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Plain text with _sub, _{sub}, ^sup, ^{sup}
  function rich(s) {
    s = String(s == null ? '' : s);
    var out = '', i = 0;
    while (i < s.length) {
      var c = s[i];
      if ((c === '_' || c === '^') && i + 1 < s.length) {
        var sub;
        if (s[i + 1] === '{') {
          var j = s.indexOf('}', i + 2);
          if (j < 0) j = s.length;
          sub = s.slice(i + 2, j);
          i = j + 1;
        } else {
          sub = s[i + 1];
          i += 2;
        }
        var up = c === '^';
        out += '<tspan dy="' + (up ? '-0.45em' : '0.32em') + '" font-size="72%">' + esc(sub) + '</tspan>' +
          '<tspan dy="' + (up ? '0.45em' : '-0.32em') + '">​</tspan>';
      } else {
        out += esc(c);
        i++;
      }
    }
    return out;
  }

  function textEl(x, y, str, opts) {
    opts = opts || {};
    var lines = String(str).split('\n');
    var anchor = opts.anchor || 'middle';
    var cls = opts.cls || 'ck-text';
    var lh = opts.lh || 15;
    var size = opts.size ? ' font-size="' + opts.size + '"' : '';
    var weight = opts.bold ? ' font-weight="700"' : '';
    var y0 = y;
    if (opts.vcenter) y0 = y - ((lines.length - 1) * lh) / 2 + 5;
    var out = '';
    for (var k = 0; k < lines.length; k++) {
      out += '<text class="' + cls + '" x="' + x.toFixed(1) + '" y="' + (y0 + k * lh).toFixed(1) +
        '" text-anchor="' + anchor + '"' + size + weight + '>' + rich(lines[k]) + '</text>';
    }
    return out;
  }

  function ln(x1, y1, x2, y2, cls) {
    return '<line class="' + (cls || 'ck-w') + '" x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '"/>';
  }

  var BODY = { R: 44, C: 12, L: 52, V: 38, I: 38, VAC: 38, DV: 40, DI: 40, BAT: 10, SW: 36, D: 22, M: 34, LAMP: 30 };

  function renderCircuit(spec) {
    var U = spec.unit || 40;
    var parts = spec.parts || [];
    var pts = [];
    var body = '';
    var ids = 0;
    var errs = [];

    function P(p) {
      if (!p || p.length !== 2 || typeof p[0] !== 'number' || typeof p[1] !== 'number') throw new Error('bad point ' + JSON.stringify(p));
      pts.push(p);
      return [p[0] * U, p[1] * U];
    }

    function labelFor(part, cx, cy, ux, uy, halfWidth) {
      var txt = [part.label, part.value].filter(function (v) { return v != null && v !== ''; }).join('\n');
      if (!txt) return '';
      if (part.lpos) {
        return textEl(cx + part.lpos[0] * U, cy + part.lpos[1] * U, txt, { anchor: part.lanchor || 'middle', vcenter: true });
      }
      var horiz = Math.abs(ux) >= Math.abs(uy);
      var side = part.side === -1 ? -1 : 1;
      var off = (halfWidth || 14) + 8;
      var nLines = txt.split('\n').length;
      if (Math.abs(ux) > 0.3 && Math.abs(uy) > 0.3) {
        // diagonal: push the label out along the normal (side 1 = upper side)
        var nx = -uy, ny = ux;
        if (ny > 0) { nx = -nx; ny = -ny; }
        nx *= side; ny *= side;
        var d = off + 10;
        return textEl(cx + nx * d, cy + ny * d, txt, { anchor: nx > 0.2 ? 'start' : (nx < -0.2 ? 'end' : 'middle'), vcenter: true });
      }
      if (horiz) {
        // above (side 1) or below (side -1)
        if (side === 1) return textEl(cx, cy - off - (nLines - 1) * 15, txt, { anchor: 'middle' });
        return textEl(cx, cy + off + 11, txt, { anchor: 'middle' });
      }
      if (side === 1) return textEl(cx + off, cy, txt, { anchor: 'start', vcenter: true });
      return textEl(cx - off, cy, txt, { anchor: 'end', vcenter: true });
    }

    function twoTerm(part, bodyLen, drawBody, halfWidth, extraGlobal) {
      var A = P(part.a), B = P(part.b);
      var dx = B[0] - A[0], dy = B[1] - A[1];
      var L = Math.hypot(dx, dy);
      if (L < 1) throw new Error(part.t + ': a and b coincide');
      var ang = Math.atan2(dy, dx) * 180 / Math.PI;
      var bl = Math.min(bodyLen, L * 0.85);
      var s = (L - bl) / 2;
      var ux = dx / L, uy = dy / L;
      var cx = (A[0] + B[0]) / 2, cy = (A[1] + B[1]) / 2;
      var g = '<g transform="translate(' + A[0].toFixed(1) + ',' + A[1].toFixed(1) + ') rotate(' + ang.toFixed(2) + ')">';
      g += ln(0, 0, s, 0) + ln(s + bl, 0, L, 0) + drawBody(s, bl, L);
      g += '</g>';
      if (extraGlobal) g += extraGlobal(cx, cy, ux, uy, bl);
      g += labelFor(part, cx, cy, ux, uy, halfWidth);
      return g;
    }

    var drawers = {
      R: function (p) {
        return twoTerm(p, BODY.R, function (s, bl) {
          var n = 6, step = bl / n, d = 'M' + s + ',0 L' + (s + step / 2) + ',-8';
          for (var k = 1; k < n; k++) d += ' L' + (s + step / 2 + k * step) + ',' + (k % 2 ? 8 : -8);
          d += ' L' + (s + bl) + ',0';
          return '<path class="ck-w" fill="none" d="' + d + '"/>';
        }, 9);
      },
      C: function (p) {
        return twoTerm(p, BODY.C, function (s, bl) {
          var g = ln(s, -15, s, 15, 'ck-w ck-thick');
          if (p.polar) g += '<path class="ck-w ck-thick" fill="none" d="M' + (s + bl + 5) + ',-15 Q' + (s + bl - 3) + ',0 ' + (s + bl + 5) + ',15"/>';
          else g += ln(s + bl, -15, s + bl, 15, 'ck-w ck-thick');
          return g;
        }, 15, function (cx, cy, ux, uy) {
          if (!p.polar) return '';
          // + mark on the a-side plate
          var horiz = Math.abs(ux) >= Math.abs(uy);
          var px = cx - ux * 14 + (horiz ? 0 : 12), py = cy - uy * 14 + (horiz ? -12 : 0);
          return textEl(px, py + 4, '+', { cls: 'ck-pm' });
        });
      },
      L: function (p) {
        return twoTerm(p, BODY.L, function (s, bl) {
          var n = 4, r = bl / (2 * n), d = 'M' + s + ',0';
          for (var k = 0; k < n; k++) d += ' a' + r + ',' + r + ' 0 0 1 ' + (2 * r) + ',0';
          return '<path class="ck-w" fill="none" d="' + d + '"/>';
        }, 10);
      },
      V: function (p) {
        return twoTerm(p, BODY.V, function (s, bl) {
          return '<circle class="ck-w ck-src" cx="' + (s + bl / 2) + '" cy="0" r="' + (bl / 2) + '"/>';
        }, 19, function (cx, cy, ux, uy) {
          var plusAtA = p.plus === 'a';
          var sgn = plusAtA ? -1 : 1;
          return textEl(cx + ux * 9 * sgn, cy + uy * 9 * sgn + 5, '+', { cls: 'ck-pm' }) +
            textEl(cx - ux * 9 * sgn, cy - uy * 9 * sgn + 5, '−', { cls: 'ck-pm' });
        });
      },
      BAT: function (p) {
        return twoTerm(p, BODY.BAT, function (s, bl) {
          var plusAtA = p.plus === 'a';
          var longX = plusAtA ? s : s + bl, shortX = plusAtA ? s + bl : s;
          return ln(longX, -16, longX, 16, 'ck-w ck-thick') + ln(shortX, -8, shortX, 8, 'ck-w ck-thick');
        }, 16, function (cx, cy, ux, uy) {
          var plusAtA = p.plus === 'a';
          var sgn = plusAtA ? -1 : 1;
          var horiz = Math.abs(ux) >= Math.abs(uy);
          var ox = horiz ? 0 : -14, oy = horiz ? -20 : 0;
          if (p.side === -1) { ox = -ox; oy = horiz ? 30 : 0; if (!horiz) ox = 14; }
          return textEl(cx + ux * 14 * sgn + ox, cy + uy * 14 * sgn + oy + 5, '+', { cls: 'ck-pm' });
        });
      },
      VAC: function (p) {
        return twoTerm(p, BODY.VAC, function (s, bl) {
          return '<circle class="ck-w ck-src" cx="' + (s + bl / 2) + '" cy="0" r="' + (bl / 2) + '"/>';
        }, 19, function (cx, cy, ux, uy) {
          var d = 'M' + (cx - 11) + ',' + cy;
          for (var k = 1; k <= 22; k++) { var x = cx - 11 + k; d += ' L' + x + ',' + (cy - 7 * Math.sin(2 * Math.PI * k / 22)).toFixed(1); }
          var out = '<path class="ck-w" fill="none" d="' + d + '"/>';
          if (p.plus) {
            var sgn = p.plus === 'a' ? -1 : 1;
            var horiz = Math.abs(ux) >= Math.abs(uy);
            out += textEl(cx + ux * 26 * sgn + (horiz ? 0 : -10), cy + uy * 26 * sgn + (horiz ? -10 : 0) + 5, '+', { cls: 'ck-pm' });
          }
          return out;
        });
      },
      I: function (p) {
        return twoTerm(p, BODY.I, function (s, bl) {
          var c = s + bl / 2;
          return '<circle class="ck-w ck-src" cx="' + c + '" cy="0" r="' + (bl / 2) + '"/>' + ln(c - 11, 0, c + 6, 0) +
            '<path class="ck-fill" d="M' + (c + 12) + ',0 L' + (c + 3) + ',-5 L' + (c + 3) + ',5 Z"/>';
        }, 19);
      },
      DV: function (p) {
        return twoTerm(p, BODY.DV, function (s, bl) {
          var c = s + bl / 2, h = bl / 2;
          return '<path class="ck-w ck-src" d="M' + s + ',0 L' + c + ',' + (-h) + ' L' + (s + bl) + ',0 L' + c + ',' + h + ' Z"/>';
        }, 20, function (cx, cy, ux, uy) {
          var sgn = p.plus === 'a' ? -1 : 1;
          return textEl(cx + ux * 9 * sgn, cy + uy * 9 * sgn + 5, '+', { cls: 'ck-pm' }) +
            textEl(cx - ux * 9 * sgn, cy - uy * 9 * sgn + 5, '−', { cls: 'ck-pm' });
        });
      },
      DI: function (p) {
        return twoTerm(p, BODY.DI, function (s, bl) {
          var c = s + bl / 2, h = bl / 2;
          return '<path class="ck-w ck-src" d="M' + s + ',0 L' + c + ',' + (-h) + ' L' + (s + bl) + ',0 L' + c + ',' + h + ' Z"/>' +
            ln(c - 10, 0, c + 5, 0) + '<path class="ck-fill" d="M' + (c + 11) + ',0 L' + (c + 2) + ',-5 L' + (c + 2) + ',5 Z"/>';
        }, 20);
      },
      D: function (p) {
        return twoTerm(p, BODY.D, function (s, bl) {
          return '<path class="ck-w ck-fill-soft" d="M' + s + ',-10 L' + (s + bl - 4) + ',0 L' + s + ',10 Z"/>' + ln(s + bl - 4, -10, s + bl - 4, 10, 'ck-w ck-thick') + ln(s + bl - 4, 0, s + bl, 0);
        }, 11);
      },
      SW: function (p) {
        var closed = p.state === 'closed';
        return twoTerm(p, BODY.SW, function (s, bl) {
          var g = '<circle class="ck-w ck-open" cx="' + s + '" cy="0" r="3"/><circle class="ck-w ck-open" cx="' + (s + bl) + '" cy="0" r="3"/>';
          if (closed) g += ln(s + 3, 0, s + bl - 3, 0);
          else g += ln(s + 2, -2, s + bl - 4, -17);
          if (p.arrow) {
            // curved arrow showing the action (opens/closes)
            g += '<path class="ck-w" fill="none" d="M' + (s + bl * 0.75) + ',' + (closed ? -4 : -18) + ' q6,' + (closed ? -8 : 8) + ' 0,' + (closed ? -14 : 14) + '"/>';
          }
          return g;
        }, 18);
      },
      M: function (p) {
        return twoTerm(p, BODY.M, function (s, bl) {
          return '<circle class="ck-w ck-src" cx="' + (s + bl / 2) + '" cy="0" r="' + (bl / 2) + '"/>';
        }, 17, function (cx, cy) {
          return textEl(cx, cy + 5, p.sym || 'V', { cls: 'ck-pm', bold: true });
        });
      },
      LAMP: function (p) {
        return twoTerm(p, BODY.LAMP, function (s, bl) {
          var c = s + bl / 2, r = bl / 2, k = r * 0.7;
          return '<circle class="ck-w ck-src" cx="' + c + '" cy="0" r="' + r + '"/>' + ln(c - k, -k, c + k, k) + ln(c - k, k, c + k, -k);
        }, 15);
      },
      W: function (p) {
        if (!p.pts || p.pts.length < 2) throw new Error('W needs pts (>=2)');
        var d = '';
        p.pts.forEach(function (q, k) { var Q = P(q); d += (k ? ' L' : 'M') + Q[0].toFixed(1) + ',' + Q[1].toFixed(1); });
        return '<path class="ck-w' + (p.dashed ? ' ck-dash' : '') + '" fill="none" d="' + d + '"/>';
      },
      N: function (p) {
        var Q = P(p.at);
        var g = p.open ? '<circle class="ck-w ck-open" cx="' + Q[0] + '" cy="' + Q[1] + '" r="4.5"/>' : '<circle class="ck-fill" cx="' + Q[0] + '" cy="' + Q[1] + '" r="3.6"/>';
        if (p.label) {
          var o = { n: [0, -10, 'middle'], s: [0, 20, 'middle'], e: [9, 5, 'start'], w: [-9, 5, 'end'], ne: [7, -7, 'start'], nw: [-7, -7, 'end'], se: [7, 16, 'start'], sw: [-7, 16, 'end'] }[p.pos || 'ne'];
          g += textEl(Q[0] + o[0], Q[1] + o[1], p.label, { anchor: o[2], cls: 'ck-node' });
        }
        return g;
      },
      G: function (p) {
        var Q = P(p.at), x = Q[0], y = Q[1];
        return ln(x, y, x, y + 10) + ln(x - 12, y + 10, x + 12, y + 10) + ln(x - 7, y + 15, x + 7, y + 15) + ln(x - 3, y + 20, x + 3, y + 20);
      },
      T: function (p) {
        var Q = P(p.at);
        return textEl(Q[0], Q[1], p.text, { anchor: p.anchor || 'middle', size: p.size, bold: p.bold, cls: p.cls === 'accent' ? 'ck-text ck-accent-t' : (p.cls === 'muted' ? 'ck-text ck-muted' : 'ck-text') });
      },
      IARR: function (p) {
        var A = P(p.a), B = P(p.b);
        var dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
        var mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
        var tip = [mx + ux * 7, my + uy * 7];
        var nx = -uy, ny = ux;
        var b1 = [mx - ux * 6 + nx * 6, my - uy * 6 + ny * 6], b2 = [mx - ux * 6 - nx * 6, my - uy * 6 - ny * 6];
        var g = '<path class="ck-accent" d="M' + tip[0].toFixed(1) + ',' + tip[1].toFixed(1) + ' L' + b1[0].toFixed(1) + ',' + b1[1].toFixed(1) + ' L' + b2[0].toFixed(1) + ',' + b2[1].toFixed(1) + ' Z"/>';
        if (p.label) {
          var horiz = Math.abs(ux) >= Math.abs(uy), side = p.side === -1 ? -1 : 1;
          if (horiz) g += textEl(mx, my + (side === 1 ? -12 : 22), p.label, { cls: 'ck-text ck-accent-t' });
          else g += textEl(mx + (side === 1 ? 12 : -12), my + 5, p.label, { anchor: side === 1 ? 'start' : 'end', cls: 'ck-text ck-accent-t' });
        }
        return g;
      },
      VM: function (p) {
        var A = P(p.a), B = P(p.b);
        var g = textEl(A[0], A[1] + 5, '+', { cls: 'ck-pm ck-accent-t' }) + textEl(B[0], B[1] + 5, '−', { cls: 'ck-pm ck-accent-t' });
        if (p.label) {
          var at = p.lat ? P(p.lat) : [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
          g += textEl(at[0], at[1] + 5, p.label, { cls: 'ck-text ck-accent-t', anchor: p.anchor || 'middle' });
        }
        return g;
      },
      BOX: function (p) {
        var A = P(p.a), B = P(p.b);
        var x = Math.min(A[0], B[0]), y = Math.min(A[1], B[1]), w = Math.abs(B[0] - A[0]), h = Math.abs(B[1] - A[1]);
        var g = '<rect class="ck-box" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="6"/>';
        if (p.label) g += textEl(x + 6, y + 16, p.label, { anchor: 'start', cls: 'ck-text ck-muted' });
        return g;
      },
      ARROW: function (p) {
        var A = P(p.a), B = P(p.b);
        var dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
        var h1 = [B[0] - ux * 9 + nx * 5, B[1] - uy * 9 + ny * 5], h2 = [B[0] - ux * 9 - nx * 5, B[1] - uy * 9 - ny * 5];
        var g = ln(A[0], A[1], B[0] - ux * 4, B[1] - uy * 4, 'ck-arrow') + '<path class="ck-accent" d="M' + B[0] + ',' + B[1] + ' L' + h1[0].toFixed(1) + ',' + h1[1].toFixed(1) + ' L' + h2[0].toFixed(1) + ',' + h2[1].toFixed(1) + ' Z"/>';
        if (p.label) { var at = p.lat ? P(p.lat) : [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2 - 8]; g += textEl(at[0], at[1], p.label, { cls: 'ck-text ck-accent-t', anchor: p.anchor || 'middle' }); }
        return g;
      }
    };

    parts.forEach(function (p, k) {
      var f = drawers[p.t];
      try {
        if (!f) throw new Error('unknown part type "' + p.t + '"');
        body += f(p);
      } catch (e) {
        errs.push('part #' + k + ' (' + (p && p.t) + '): ' + e.message);
      }
    });

    if (!pts.length) { pts.push([0, 0]); pts.push([1, 1]); }
    var xs = pts.map(function (q) { return q[0]; }), ys = pts.map(function (q) { return q[1]; });
    var pad = (spec.pad != null ? spec.pad : 0.9) * U;
    var padX = spec.padX != null ? spec.padX * U : pad + 0.6 * U;
    var minX = Math.min.apply(null, xs) * U - padX, maxX = Math.max.apply(null, xs) * U + padX;
    var minY = Math.min.apply(null, ys) * U - pad, maxY = Math.max.apply(null, ys) * U + pad;
    var W = maxX - minX, H = maxY - minY;
    var scale = spec.scale || 1.15;
    var svg = '<svg class="ckt" xmlns="http://www.w3.org/2000/svg" viewBox="' + minX.toFixed(1) + ' ' + minY.toFixed(1) + ' ' + W.toFixed(1) + ' ' + H.toFixed(1) + '" width="' + (W * scale).toFixed(0) + '" role="img"' +
      (spec.alt ? ' aria-label="' + esc(spec.alt) + '"' : '') + '>' + (spec.alt ? '<title>' + esc(spec.alt) + '</title>' : '') + body + '</svg>';
    if (errs.length) {
      svg += '<div class="diagram-error">Diagram problems: ' + esc(errs.join('; ')) + '</div>';
    }
    return { svg: svg, errors: errs };
  }

  /* Oscilloscope screen.
   * {type:"scope", cols:10, rows:8, vdiv:"2 V/div", tdiv:"1 ms/div", traces:[...], marks:[...], info:"..."}
   * x is measured in divisions from the left edge (0..cols); y in divisions from the centre line (+ up).
   */
  function renderScope(spec) {
    var cols = spec.cols || 10, rows = spec.rows || 8, D = spec.divPx || 44;
    var W = cols * D, H = rows * D, m = 14, top = 10;
    var errs = [];
    var g = '';
    g += '<rect class="sc-bg" x="0" y="0" width="' + W + '" height="' + H + '"/>';
    for (var i = 0; i <= cols; i++) g += ln(i * D, 0, i * D, H, i === cols / 2 ? 'sc-axis' : 'sc-grid');
    for (var j = 0; j <= rows; j++) g += ln(0, j * D, W, j * D, j === rows / 2 ? 'sc-axis' : 'sc-grid');
    for (var t = 0; t <= cols * 5; t++) { var x = t * D / 5; g += ln(x, H / 2 - 3, x, H / 2 + 3, 'sc-axis'); }
    for (var u = 0; u <= rows * 5; u++) { var y = u * D / 5; g += ln(W / 2 - 3, y, W / 2 + 3, y, 'sc-axis'); }
    function Y(v) { return H / 2 - v * D; }
    function X(v) { return v * D; }
    (spec.traces || []).forEach(function (tr, k) {
      var f;
      try {
        if (tr.fn) {
          /* jshint evil:true */
          f = new Function('x', 'with(Math){return (' + tr.fn + ');}');
        } else {
          var A = tr.amp || 0, Pd = tr.period || 4, ph = (tr.phase || 0) * Math.PI / 180, off = tr.offset || 0, x0 = tr.x0 || 0;
          var shape = tr.shape || 'sine';
          if (shape === 'sine') f = function (x) { return off + A * Math.sin(2 * Math.PI * (x - x0) / Pd + ph); };
          else if (shape === 'square') { var duty = tr.duty || 0.5; f = function (x) { var q = (((x - x0) / Pd) % 1 + 1) % 1; return off + (q < duty ? A : -A); }; }
          else if (shape === 'triangle') f = function (x) { var q = (((x - x0) / Pd) % 1 + 1) % 1; return off + A * (q < 0.5 ? (4 * q - 1) : (3 - 4 * q)); };
          else if (shape === 'dc') f = function () { return off; };
          else if (shape === 'charge') { var vf = tr.vf, v0 = tr.v0 || 0, tau = tr.tau; f = function (x) { return x < x0 ? v0 : vf + (v0 - vf) * Math.exp(-(x - x0) / tau); }; }
          else throw new Error('unknown shape ' + shape);
        }
        var d = '', N = 600, prevY = null;
        for (var n = 0; n <= N; n++) {
          var xv = cols * n / N, yv = f(xv);
          if (!isFinite(yv)) continue;
          var yy = Math.max(-rows / 2 - 0.3, Math.min(rows / 2 + 0.3, yv));
          d += (d ? ' L' : 'M') + X(xv).toFixed(1) + ',' + Y(yy).toFixed(1);
        }
        g += '<path class="sc-trace sc-t' + ((tr.color || k + 1)) + '" d="' + d + '"/>';
        if (tr.label) g += textEl(4, 14 + 15 * k, tr.label, { anchor: 'start', cls: 'sc-lbl sc-l' + (tr.color || k + 1) });
      } catch (e) { errs.push('trace #' + k + ': ' + e.message); }
    });
    (spec.marks || []).forEach(function (mk) {
      if (mk.type === 'hline') g += ln(0, Y(mk.y), W, Y(mk.y), 'sc-cursor') + (mk.label ? textEl(W - 4, Y(mk.y) - 4, mk.label, { anchor: 'end', cls: 'sc-curlbl' }) : '');
      else if (mk.type === 'vline') g += ln(X(mk.x), 0, X(mk.x), H, 'sc-cursor') + (mk.label ? textEl(X(mk.x) + 4, H - 6, mk.label, { anchor: 'start', cls: 'sc-curlbl' }) : '');
      else if (mk.type === 'span') {
        // dimension arrow between two points (in div coords)
        var x1 = X(mk.x1), y1 = Y(mk.y1), x2 = X(mk.x2), y2 = Y(mk.y2);
        g += ln(x1, y1, x2, y2, 'sc-dim') + '<circle class="sc-dimdot" cx="' + x1 + '" cy="' + y1 + '" r="3"/><circle class="sc-dimdot" cx="' + x2 + '" cy="' + y2 + '" r="3"/>';
        if (mk.label) g += textEl((x1 + x2) / 2 + (mk.dx || 0), (y1 + y2) / 2 - 6 + (mk.dy || 0), mk.label, { cls: 'sc-curlbl' });
      } else if (mk.type === 'text') g += textEl(X(mk.x), Y(mk.y), mk.text, { anchor: mk.anchor || 'middle', cls: 'sc-curlbl' });
    });
    var readout = [spec.ch || 'CH1', spec.vdiv, spec.tdiv, spec.coupling, spec.probe ? 'probe ' + spec.probe : '', spec.info].filter(Boolean).join('   ');
    var svg = '<svg class="scope" xmlns="http://www.w3.org/2000/svg" viewBox="' + (-m) + ' ' + (-top) + ' ' + (W + 2 * m) + ' ' + (H + top + 34) + '" width="' + (W + 2 * m) + '" role="img"' + (spec.alt ? ' aria-label="' + esc(spec.alt) + '"' : '') + '>' +
      (spec.alt ? '<title>' + esc(spec.alt) + '</title>' : '') + g +
      textEl(0, H + 24, readout, { anchor: 'start', cls: 'sc-readout' }) + '</svg>';
    if (errs.length) svg += '<div class="diagram-error">Scope problems: ' + esc(errs.join('; ')) + '</div>';
    return { svg: svg, errors: errs };
  }

  function renderSpec(spec) {
    if (spec && spec.type === 'scope') return renderScope(spec);
    return renderCircuit(spec || {});
  }

  /* Render every <figure class="circuit"> / <figure class="scope"> holding a JSON <script> inside root. */
  function renderDiagrams(root) {
    var errors = [];
    var figs = root.querySelectorAll('figure.circuit, figure.scope, figure.diagram');
    Array.prototype.forEach.call(figs, function (fig, idx) {
      var sc = fig.querySelector('script[type="application/json"]');
      if (!sc || fig.getAttribute('data-rendered')) return;
      var holder = document.createElement('div');
      holder.className = 'diagram-holder';
      try {
        var spec = JSON.parse(sc.textContent);
        var r = renderSpec(spec);
        holder.innerHTML = r.svg;
        r.errors.forEach(function (e) { errors.push((fig.id || 'figure #' + idx) + ': ' + e); });
      } catch (e) {
        holder.innerHTML = '<div class="diagram-error">Diagram JSON error: ' + esc(e.message) + '</div>';
        errors.push((fig.id || 'figure #' + idx) + ': JSON ' + e.message);
      }
      fig.insertBefore(holder, sc);
      fig.setAttribute('data-rendered', '1');
    });
    return errors;
  }

  global.EEDiagrams = { renderCircuit: renderCircuit, renderScope: renderScope, renderSpec: renderSpec, renderDiagrams: renderDiagrams, rich: rich };
})(window);
