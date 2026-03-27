/* global vis, tinycolor, brothers, $, didYouMean */

// Mock out dependencies for testing on NodeJS. These are imported in HTML in
// the browser.
/* eslint-disable */
/* istanbul ignore else */
if (typeof brothers === 'undefined') {
  brothers = require('./relations');
}
/* istanbul ignore else */
if (typeof tinycolor === 'undefined') {
  tinycolor = require('tinycolor2');
}
/* istanbul ignore else */
if (typeof $ === 'undefined') {
  $ = require('jquery');
}
/* istanbul ignore else */
if (typeof vis === 'undefined') {
  vis = require('vis');
}
/* istanbul ignore else */
if (typeof didYouMean === 'undefined') {
  didYouMean = require('didyoumean');
}
/* eslint-enable */

var network = null;

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

var createNodesCalled = false;
var nodesGlobal;
var edgesGlobal;
var nodesDataSet;
var edgesDataSet;

var previousSearchFind;

var DIRECTION = {
  FORWARD: 0,
  BACKWARD: 1,
};

var KEYCODE_ENTER = 13;

var pledgeClassColorGlobal = {};
var branchColorGlobal = {};
var currentInfoNodeId = null;

function ColorSpinner(colorObj, spinAmount) {
  this.spinAmount = spinAmount;
  this.color = new tinycolor(colorObj);
}
ColorSpinner.prototype.spin = function () {
  this.color = this.color.spin(this.spinAmount);
  return this.color.toHexString();
};

var getNewPledgeClassColor = (function () {
  var spinner2 = new ColorSpinner({ h: 0, s: 0.4, v: 0.9 }, 23);
  return function () {
    return spinner2.spin();
  };
}());

function assignBranchColors(nodes) {
  var branchColor = {};
  var visited = {};

  function getColorForBranch(branchId) {
    if (!branchColorGlobal[branchId]) {
      branchColorGlobal[branchId] = new tinycolor({ h: (branchId * 137.508) % 360, s: 0.5, v: 0.9 }).toHexString();
    }
    return branchColorGlobal[branchId];
  }

  function dfs(node, color) {
    if (visited[node.id]) return;
    visited[node.id] = true;
    node.color = color;
    branchColor[node.id] = color;
    nodesDataSet.update(node);

    var hasLittles = false;
    nodes.forEach(function (child) {
      if (child.big && child.big.id === node.id) {
        hasLittles = true;
        dfs(child, color);
      }
    });

    if (!hasLittles && !node.big) {
      node.color = '#d3d3d3'; // Set to gray if no littles and no big
      nodesDataSet.update(node);
    }
  }

  nodes.forEach(function (node) {
    if (!node.big) {
      var branchColorValue = getColorForBranch(node.id);
      dfs(node, branchColorValue);
    }
  });

  return branchColor;
}

/* istanbul ignore next */
/**
 * In cases where we can't find an exact match for a brother's name, suggest
 * similar alternatives. This is only called if there is a data entry error, and
 * the purpose is to just give a hint as to how to fix the data entry issue.
 * Since this is only called for data entry bugs, and those data entry bugs
 * should not be submitted into the repo, this is currently untestable.
 */
function didYouMeanWrapper(invalidName) {
  var allValidNames = brothers.map(function (bro) {
    return bro.name;
  });
  // Find valid names which are similar to invalidName.
  var similarValidName = didYouMean(invalidName, allValidNames);
  return similarValidName;
}

function createNodes(brothers_) {
  var oldLength = brothers_.length;

  var nodes = [];
  var edges = [];
  var pledgeClassColor = {};

  for (var i = 0; i < oldLength; i++) {
    var bro = brothers_[i];
    bro.id = i;

    if (bro.big) {
      // This person is just a regular brother
      edges.push({ from: bro.big, to: bro.id });
    } else {
      // This person is the oldest brother in the family line
      bro.big = null;
    }

    var lowerCaseClass = (bro.pledgeclass || '').toLowerCase();
    if (lowerCaseClass && !pledgeClassColor[lowerCaseClass]) {
      // Add a new Pledge Class
      pledgeClassColor[lowerCaseClass] = getNewPledgeClassColor();
    }

    bro.label = `<b>${escapeHtml(bro.name)}</b>\n${escapeHtml(bro.className || '')}\n${escapeHtml(bro.pledgeclass || '')}`;

    if (bro.expelled) {
      bro.color = 'red';
      bro.font = { color: 'red', decoration: 'line-through' };
    }
    // Set the shape of the node to 'box'
    bro.shape = 'box';
    nodes.push(bro); // Add this to the list of nodes to display
  }

  var nameToNode = {};
  // Change .big from a string to a link to the big brother node
  nodes.forEach(function (member) {
    if (member.big) {
      if (nameToNode[member.big]) {
        member.big = nameToNode[member.big];
      } else {
        nodes.forEach(function (member2) {
          if (member.big === member2.name) {
            nameToNode[member.big] = member2;
            member.big = member2;
          }
        });
      }
    }
  });

  // Fix the edges that point from strings instead of node IDs
  edges.forEach(function (edge) {
    if (typeof edge.from === 'string') {
      var name = edge.from;
      var node = nameToNode[name];
      /* istanbul ignore next */
      if (!node) {
        var correctedName = didYouMeanWrapper(name);
        var msg;
        if (!correctedName) {
          msg = 'Unable to find a match for '
            + JSON.stringify(name);
        } else if (name.trim() === correctedName.trim()) {
          msg = 'Inconsistent whitespace. Expected to find '
            + JSON.stringify(correctedName)
            + ', but actually found ' + JSON.stringify(name) + '. These should '
            + 'have consistent whitespace.';
        } else {
          msg = 'Unable to find ' + JSON.stringify(name)
            + ', did you mean ' + JSON.stringify(correctedName)
            + '?';
        }
        throw new Error(msg);
      }
      edge.from = node.id;
    }
  });

  // Honorary members: style gold, chain vertically in pledge class order
  var honoraryMembers = nodes.filter(function (n) { return n.familyStarted === 'Honorary'; });
  if (honoraryMembers.length > 0) {
    honoraryMembers.forEach(function (n) {
      n.isHonorary = true;
      n.color = { background: '#D4AF37', border: '#8B6914', highlight: { background: '#e8c84a', border: '#8B6914' } };
      n.font = { color: '#111111' };
    });

    var virtualId = brothers_.length;
    var edgeStyle = { dashes: true, arrows: { to: false }, color: { color: '#D4AF37', opacity: 0.6 } };

    nodes.push({
      id: virtualId, isVirtual: true, name: null, big: null,
      shape: 'ellipse', label: 'Honorary\nMembers',
      color: { background: '#111111', border: '#D4AF37', highlight: { background: '#222222', border: '#D4AF37' } },
      font: { color: '#D4AF37', size: 13, multi: false },
    });

    // Group by pledge class, sorted chronologically
    var honoraryByClass = {};
    honoraryMembers.forEach(function (n) {
      var pc = n.pledgeclass || 'Unknown';
      if (!honoraryByClass[pc]) honoraryByClass[pc] = [];
      honoraryByClass[pc].push(n);
    });
    var sortedClasses = Object.keys(honoraryByClass).sort(function (a, b) {
      return parsePledgeClass(a) - parsePledgeClass(b);
    });

    // Chain class groups vertically; within each class, all members share the same
    // parent so vis.js renders them as siblings (side by side)
    var prevChainId = virtualId;
    sortedClasses.forEach(function (pc) {
      var classMembers = honoraryByClass[pc];
      classMembers.forEach(function (n) {
        edges.push(Object.assign({ from: prevChainId, to: n.id }, edgeStyle));
      });
      // First member of this class anchors the chain to the next class
      prevChainId = classMembers[0].id;
    });
  }

  return [nodes, edges, pledgeClassColor];
}

// Only call this once (for effiencency & correctness)
/* istanbul ignore next */
function createNodesHelper() {
  if (createNodesCalled) return;
  createNodesCalled = true;

  var output = createNodes(brothers);
  nodesGlobal = output[0];
  edgesGlobal = output[1];
  pledgeClassColorGlobal = output[2];

  nodesDataSet = new vis.DataSet(nodesGlobal);
  edgesDataSet = new vis.DataSet(edgesGlobal);
}

function findBrother(name, nodes, prevElem, direction) {
  var lowerCaseName = name.toLowerCase();
  var matches = nodes.filter(function (element) {
    return element.name && element.name.toLowerCase().includes(lowerCaseName);
  });
  if (matches.length === 0) {
    return undefined;
  }

  // throw Error(`direction is ${direction}`);
  var increment = direction === DIRECTION.FORWARD ? 1 : -1;
  var idx = 0;
  if (prevElem) {
    idx = matches.indexOf(prevElem);
    idx = (idx + increment) % matches.length;
    if (idx < 0) {
      idx = matches.length + idx;
    }
  }
  return matches[idx];
}

/**
 * Searches for the specific brother (case-insensitive, matches any substring).
 * If found, this zooms the network to focus on that brother's node.
 *
 * Returns whether or not the search succeeded. This always returns `true` for
 * an empty query.
 */
/* istanbul ignore next */
function findBrotherHelper(name, direction) {
  if (!name) return true; // Don't search for an empty query.
  // This requires the network to be instantiated, which implies `nodesGlobal`
  // has been populated.
  if (!network) return false;

  var found = findBrother(name, nodesGlobal, previousSearchFind, direction);
  previousSearchFind = found;

  if (found) {
    network.focus(found.id, {
      scale: 0.9,
      animation: true,
    });
    network.selectNodes([found.id]);
    if (typeof document !== 'undefined') showInfoPanel(found.id);
    return true;
  }
  return false; // Could not find a match
}

function normalizeImageUrl(url) {
  if (!url) return url;
  // Convert Google Drive share/view links to the embeddable thumbnail endpoint
  var idMatch = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/) ||
                url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (idMatch && url.includes('drive.google.com')) {
    return 'https://drive.google.com/thumbnail?id=' + idMatch[1] + '&sz=w400';
  }
  return url;
}

/* istanbul ignore next */
function showInfoPanel(nodeId) {
  var node = nodesGlobal.find(function (n) { return n.id === nodeId; });
  if (!node || node.isVirtual) return;
  highlightPersonFamily(nodeId);

  // Photo
  var photoEl = document.getElementById('info-panel-photo');
  if (node.picture) {
    photoEl.src = normalizeImageUrl(node.picture);
    photoEl.alt = node.name;
    photoEl.style.display = 'block';
  } else {
    photoEl.style.display = 'none';
  }

  // Name, class, pledge class
  document.getElementById('info-panel-name').textContent = node.name;
  var metaEl = document.getElementById('info-panel-meta');
  metaEl.innerHTML = '';
  if (node.className) {
    var classLink = document.createElement('span');
    classLink.className = 'class-link';
    classLink.textContent = node.className;
    classLink.dataset.pledgeClass = node.pledgeclass || '';
    metaEl.appendChild(classLink);
  }
  if (node.className && node.pledgeclass) {
    metaEl.appendChild(document.createTextNode(' · '));
  }
  if (node.pledgeclass) {
    metaEl.appendChild(document.createTextNode(node.pledgeclass));
  }

  // Bio
  var bioEl = document.getElementById('info-panel-bio');
  if (node.bio) {
    bioEl.innerHTML = '';
    var bioLabels = ['Major:', 'Grad Year:', 'Positions Held:', 'Bio:'];
    var bioLines = node.bio.split('\n').filter(function (l) { return l.trim(); });
    bioLines.forEach(function (line, i) {
      if (i > 0) bioEl.appendChild(document.createElement('br'));
      var matched = bioLabels.find(function (lbl) { return line.startsWith(lbl); });
      if (matched) {
        var strong = document.createElement('strong');
        strong.textContent = matched;
        bioEl.appendChild(strong);
        bioEl.appendChild(document.createTextNode(line.slice(matched.length)));
      } else {
        bioEl.appendChild(document.createTextNode(line));
      }
    });
    bioEl.style.display = 'block';
  } else {
    bioEl.style.display = 'none';
  }

  // Big
  var bigWrap = document.getElementById('info-panel-big-wrap');
  var bigEl = document.getElementById('info-panel-big');
  if (node.big) {
    bigEl.textContent = node.big.name;
    bigEl.dataset.nodeId = node.big.id;
    bigWrap.style.display = 'block';
  } else {
    bigWrap.style.display = 'none';
  }

  // Littles
  var littlesWrap = document.getElementById('info-panel-littles-wrap');
  var littlesEl = document.getElementById('info-panel-littles');
  var littles = nodesGlobal.filter(function (n) { return n.big && n.big.id === nodeId; });
  littlesEl.innerHTML = '';
  if (littles.length > 0) {
    littles.forEach(function (little) {
      var li = document.createElement('li');
      li.textContent = little.name;
      li.dataset.nodeId = little.id;
      littlesEl.appendChild(li);
    });
    littlesWrap.style.display = 'block';
  } else {
    littlesWrap.style.display = 'none';
  }

  currentInfoNodeId = nodeId;
  history.replaceState(null, '', '?member=' + nodeId);
  document.getElementById('info-panel').classList.add('open');
}

/* istanbul ignore next */
function closeInfoPanel() {
  document.getElementById('info-panel').classList.remove('open');
  closeClassPanel();
  currentInfoNodeId = null;
  history.replaceState(null, '', window.location.pathname);
}

function parsePledgeClass(str) {
  if (!str) return 0;
  var parts = str.trim().split(' ');
  var year = parseInt(parts[parts.length - 1], 10) || 0;
  var semester = parts[0].toLowerCase() === 'spring' ? 0 : 1;
  return year * 2 + semester;
}

/* istanbul ignore next */
function showClassPanel(pledgeClass) {
  // Build an ordered map of pledgeclass → className
  var classMap = {};
  nodesGlobal.forEach(function (n) {
    if (n.pledgeclass && !classMap[n.pledgeclass]) {
      classMap[n.pledgeclass] = n.className || n.pledgeclass;
    }
  });
  var sorted = Object.keys(classMap).sort(function (a, b) {
    return parsePledgeClass(a) - parsePledgeClass(b);
  });
  var idx = sorted.indexOf(pledgeClass);

  document.getElementById('class-panel-name').textContent = classMap[pledgeClass] || pledgeClass;
  document.getElementById('class-panel-semester').textContent = pledgeClass;

  // Previous class
  var prevWrap = document.getElementById('class-panel-prev-wrap');
  var prevEl = document.getElementById('class-panel-prev');
  if (idx > 0) {
    var prevClass = sorted[idx - 1];
    prevEl.textContent = classMap[prevClass];
    prevEl.dataset.pledgeClass = prevClass;
    prevWrap.style.display = 'block';
  } else {
    prevWrap.style.display = 'none';
  }

  // Next class
  var nextWrap = document.getElementById('class-panel-next-wrap');
  var nextEl = document.getElementById('class-panel-next');
  if (idx < sorted.length - 1) {
    var nextClass = sorted[idx + 1];
    nextEl.textContent = classMap[nextClass];
    nextEl.dataset.pledgeClass = nextClass;
    nextWrap.style.display = 'block';
  } else {
    nextWrap.style.display = 'none';
  }

  // Members
  var membersEl = document.getElementById('class-panel-members');
  membersEl.innerHTML = '';
  nodesGlobal
    .filter(function (n) { return n.pledgeclass === pledgeClass; })
    .forEach(function (member) {
      var li = document.createElement('li');
      li.textContent = member.name;
      li.dataset.nodeId = member.id;
      membersEl.appendChild(li);
    });

  history.replaceState(null, '', '?class=' + encodeURIComponent(pledgeClass));
  document.getElementById('class-panel').classList.add('open');
  highlightClassMembers(pledgeClass);
}

/* istanbul ignore next */
function closeClassPanel() {
  document.getElementById('class-panel').classList.remove('open');
  if (document.getElementById('info-panel').classList.contains('open') && currentInfoNodeId != null) {
    history.replaceState(null, '', '?member=' + currentInfoNodeId);
  } else {
    history.replaceState(null, '', window.location.pathname);
  }
}

function computeStats() {
  var realNodes = nodesGlobal.filter(function (n) { return !n.isVirtual; });
  var total = realNodes.length;
  var activeCount = realNodes.filter(function (n) { return !n.graduated && !n.isHonorary; }).length;

  // Per-class counts (exclude virtual/honorary)
  var classCounts = {};
  realNodes.forEach(function (n) {
    if (n.pledgeclass && !n.isHonorary) classCounts[n.pledgeclass] = (classCounts[n.pledgeclass] || 0) + 1;
  });
  var classEntries = Object.entries(classCounts);
  var totalClasses = classEntries.length;
  var avgClassSize = totalClasses ? (total / totalClasses).toFixed(1) : 0;
  var largestEntry = classEntries.sort(function (a, b) { return b[1] - a[1]; })[0];
  var largestClassPledge = largestEntry ? largestEntry[0] : null;
  var largestClassNode = largestClassPledge ? nodesGlobal.find(function (n) { return n.pledgeclass === largestClassPledge; }) : null;
  var largestClassCount = largestEntry ? largestEntry[1] : 0;

  // Longest lineage (deepest node from root)
  var nodeById = {};
  nodesGlobal.forEach(function (n) { nodeById[n.id] = n; });
  var maxDepth = 0;
  var deepestNode = null;
  nodesGlobal.forEach(function (n) {
    var depth = 0, cur = n;
    while (cur && cur.big) { depth++; cur = nodeById[cur.big.id]; }
    if (depth > maxDepth) { maxDepth = depth; deepestNode = n; }
  });

  // Most common major
  var majorCounts = {};
  nodesGlobal.forEach(function (n) {
    if (!n.bio) return;
    var match = n.bio.match(/Major:\s*([^\n]+)/);
    if (match) {
      var major = match[1].trim();
      majorCounts[major] = (majorCounts[major] || 0) + 1;
    }
  });
  var topMajor = Object.entries(majorCounts).sort(function (a, b) { return b[1] - a[1]; })[0] || null;

  return { total, activeCount, totalClasses, avgClassSize, largestClassNode, largestClassPledge, largestClassCount, maxDepth, deepestNode, topMajor };
}

/* istanbul ignore next */
function showStatsPanel() {
  var s = computeStats();
  var el = document.getElementById('stats-content');
  el.innerHTML = '';

  function row(label, valueHtml) {
    var div = document.createElement('div');
    div.className = 'stat-item';
    div.innerHTML = '<span class="stat-label">' + label + '</span><span class="stat-value">' + valueHtml + '</span>';
    el.appendChild(div);
  }

  row('Total Members', s.total);
  row('Active Members', s.activeCount);
  row('Total Classes', s.totalClasses);
  row('Avg Class Size', s.avgClassSize);
  if (s.largestClassNode) {
    row('Largest Class',
      '<span class="class-link" data-pledge-class="' + s.largestClassPledge + '" style="cursor:pointer">' +
      (s.largestClassNode.className || s.largestClassPledge) + '</span> (' + s.largestClassCount + ')');
  }
  if (s.topMajor) {
    row('Most Common Major', s.topMajor[0] + ' (' + s.topMajor[1] + ')');
  }
  if (s.deepestNode) {
    row('Longest Lineage',
      '<span style="cursor:pointer;text-decoration:underline" data-node-id="' + s.deepestNode.id + '">' +
      s.deepestNode.name + '</span> (' + s.maxDepth + ' generations)');
  }

  document.getElementById('stats-panel').classList.add('open');
}

/* istanbul ignore next */
function closeStatsPanel() {
  document.getElementById('stats-panel').classList.remove('open');
}

/* istanbul ignore next */
function highlightClassMembers(pledgeClass) {
  var memberIds = nodesGlobal
    .filter(function (n) { return n.pledgeclass === pledgeClass; })
    .map(function (n) { return n.id; });

  nodesGlobal.forEach(function (node) {
    if (node.isVirtual || node.isHonorary) return;
    node.color = memberIds.includes(node.id) ? 'lightblue' : '#d3d3d3';
    nodesDataSet.update(node);
  });
  edgesGlobal.forEach(function (edge) {
    if (edge.dashes) return;
    edge.color = { color: '#d3d3d3' };
    edgesDataSet.update(edge);
  });
  network.selectNodes(memberIds);
  network.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
}

function highlightPersonFamily(nodeId) {
  var node = nodesGlobal.find(function (n) { return n.id === nodeId; });
  if (!node) return;

  var highlightedNodes = [nodeId];
  var highlightedEdgeIds = new Set();

  // Add big (skip if connected via honorary virtual root)
  if (node.big) {
    highlightedNodes.push(node.big.id);
    var bigEdge = edgesGlobal.find(function (e) { return e.to === nodeId && !e.dashes; });
    if (bigEdge) highlightedEdgeIds.add(bigEdge.id);
  }

  // Add littles
  nodesGlobal.forEach(function (n) {
    if (n.big && n.big.id === nodeId) {
      highlightedNodes.push(n.id);
      var littleEdge = edgesGlobal.find(function (e) { return e.to === n.id && !e.dashes; });
      if (littleEdge) highlightedEdgeIds.add(littleEdge.id);
    }
  });

  nodesGlobal.forEach(function (n) {
    if (n.isVirtual || n.isHonorary) return;
    n.color = highlightedNodes.includes(n.id) ? 'lightblue' : '#d3d3d3';
    nodesDataSet.update(n);
  });
  edgesGlobal.forEach(function (e) {
    if (e.dashes) return;
    e.color = highlightedEdgeIds.has(e.id) ? { color: 'lightblue' } : { color: '#d3d3d3' };
    edgesDataSet.update(e);
  });
}

function highlightBigs(nodeId) {
  var currentNode = nodesGlobal.find(node => node.id === nodeId);
  var highlightedNodes = [];
  var highlightedEdges = [];

  while (currentNode && currentNode.big) {
    highlightedNodes.push(currentNode.id);
    highlightedEdges.push(edgesGlobal.find(edge => edge.to === currentNode.id));
    currentNode = nodesGlobal.find(node => node.id === currentNode.big.id);
  }

  highlightedNodes.push(currentNode.id); // Add the top-most big

  nodesGlobal.forEach(node => {
    if (node.isVirtual || node.isHonorary) return;
    node.color = highlightedNodes.includes(node.id) ? 'lightblue' : '#d3d3d3';
    nodesDataSet.update(node);
  });

  edgesGlobal.forEach(edge => {
    if (edge.dashes) return;
    edge.color = highlightedEdges.includes(edge) ? { color: 'lightblue' } : { color: '#d3d3d3' };
    edgesDataSet.update(edge);
  });
}

function getNodeColorFn(colorMethod) {
  switch (colorMethod) {
    case 'pledgeClass':
      return function (node) {
        if (node.isVirtual || node.isHonorary) return;
        node.color = node.pledgeclass
          ? pledgeClassColorGlobal[node.pledgeclass.toLowerCase()]
          : 'lightgrey';
        nodesDataSet.update(node);
      };
    case 'highlightCollegiates':
      return function (node) {
        if (node.isVirtual || node.isHonorary) return;
        node.color = node.graduated ? '#d3d3d3' : 'lightblue';
        nodesDataSet.update(node);
      };
    case 'branches':
      var branchColors = assignBranchColors(nodesGlobal);
      return function (node) {
        if (node.isVirtual || node.isHonorary) return;
        node.color = branchColors[node.id];
        nodesDataSet.update(node);
      };
    default:
      return function (node) {
        if (node.isVirtual || node.isHonorary) return;
        node.color = 'lightgrey';
        nodesDataSet.update(node);
      };
  }
}

function resetColors() {
  var colorMethod = document.getElementById('layout').value;
  nodesGlobal.forEach(getNodeColorFn(colorMethod));
  edgesGlobal.forEach(edge => {
    if (edge.dashes) return;
    edge.color = { color: 'lightgrey' };
    edgesDataSet.update(edge);
  });
}

function getActiveFamilyLineNodeIds() {
  var children = {};
  var nodeById = {};
  nodesGlobal.forEach(function (node) {
    children[node.id] = [];
    nodeById[node.id] = node;
  });
  nodesGlobal.forEach(function (node) {
    if (node.big) children[node.big.id].push(node.id);
  });

  // Active leaves: no children (bottom of a branch) and not graduated
  var activeLeaves = nodesGlobal.filter(function (n) {
    return children[n.id].length === 0 && !n.graduated;
  });

  // For each active leaf, walk the ancestor chain back to the root (Alpha class)
  var activeIds = new Set();
  activeLeaves.forEach(function (leaf) {
    var current = leaf;
    while (current) {
      activeIds.add(current.id);
      current = current.big ? nodeById[current.big.id] : null;
    }
  });

  return activeIds;
}

/* istanbul ignore next */
function draw() {
  createNodesHelper();

  var colorMethod = document.getElementById('layout').value;
  nodesGlobal.forEach(getNodeColorFn(colorMethod));
  if (!network) {
    // create a network
    var container = document.getElementById('mynetwork');
    var data = {
      nodes: nodesDataSet,
      edges: edgesDataSet,
    };

    var options = {
      layout: {
        hierarchical: {
          sortMethod: 'directed',
          nodeSpacing: 175,
          levelSeparation: 125
        },
      },
      nodes: {
        font: {
          multi: 'html',
          size: 13,
          bold: { size: 15, mod: 'bold' },
        },
      },
      edges: {
        smooth: true,
        arrows: { to: true },
      },
      physics: {
        hierarchicalRepulsion: {
          nodeDistance: 125
        }
      }
    };
    network = new vis.Network(container, data, options);

    network.once('stabilized', function () {
      network.fit({ animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
      var params = new URLSearchParams(window.location.search);
      var memberId = params.get('member');
      var className = params.get('class');
      if (memberId) {
        var nodeId = parseInt(memberId, 10);
        if (nodesGlobal.find(function (n) { return n.id === nodeId; })) {
          showInfoPanel(nodeId);
          network.focus(nodeId, { scale: 0.9, animation: true });
          network.selectNodes([nodeId]);
        }
      } else if (className) {
        showClassPanel(decodeURIComponent(className));
      }
    });

    network.on('doubleClick', function (params) {
      if (params.nodes.length > 0) {
        var n = nodesGlobal.find(function (n) { return n.id === params.nodes[0]; });
        if (n && !n.isVirtual) highlightBigs(params.nodes[0]);
      }
    });

    network.on('click', function (params) {
      if (params.nodes.length === 0) {
        resetColors();
        closeInfoPanel();
      } else {
        var n = nodesGlobal.find(function (n) { return n.id === params.nodes[0]; });
        if (n && !n.isVirtual) showInfoPanel(params.nodes[0]);
      }
    });
  } else {
    network.redraw();
  }
}

/* istanbul ignore next */
function applyLineageFilter(nodeId) {
  var nodeById = {};
  nodesGlobal.forEach(function (n) { nodeById[n.id] = n; });

  var keep = new Set();

  // Walk up ancestor chain
  var cur = nodeById[nodeId];
  while (cur) {
    keep.add(cur.id);
    cur = cur.big ? nodeById[cur.big.id] : null;
  }

  // Walk down all descendants (BFS)
  var children = {};
  nodesGlobal.forEach(function (n) {
    if (n.big) {
      if (!children[n.big.id]) children[n.big.id] = [];
      children[n.big.id].push(n.id);
    }
  });
  var queue = [nodeId];
  while (queue.length) {
    var id = queue.shift();
    keep.add(id);
    (children[id] || []).forEach(function (cid) { queue.push(cid); });
  }

  var removeSet = new Set(
    nodesGlobal.filter(function (n) { return !keep.has(n.id) && !n.isVirtual; }).map(function (n) { return n.id; })
  );
  lineageRemovedNodeIds = Array.from(removeSet);
  lineageRemovedEdgeData = edgesDataSet.get({ filter: function (e) { return removeSet.has(e.from) || removeSet.has(e.to); } });

  nodesDataSet.remove(lineageRemovedNodeIds);
  edgesDataSet.remove(lineageRemovedEdgeData.map(function (e) { return e.id; }));
  network.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });

  document.getElementById('lineage-banner-name').textContent = nodeById[nodeId].name;
  document.getElementById('lineage-banner').classList.add('active');
}

/* istanbul ignore next */
function removeLineageFilter() {
  var nodesToRestore = nodesGlobal.filter(function (n) { return lineageRemovedNodeIds.includes(n.id); });
  nodesDataSet.add(nodesToRestore);
  edgesDataSet.add(lineageRemovedEdgeData);
  lineageRemovedNodeIds = [];
  lineageRemovedEdgeData = [];
  resetColors();
  network.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
  document.getElementById('lineage-banner').classList.remove('active');
}

/* istanbul ignore next */
function findConnection(nameA, nameB) {
  var nodeA = nodesGlobal.find(function (n) { return n.name && n.name.toLowerCase().includes(nameA.toLowerCase()); });
  var nodeB = nodesGlobal.find(function (n) { return n.name && n.name.toLowerCase().includes(nameB.toLowerCase()); });
  if (!nodeA) return { error: 'Could not find "' + nameA + '".' };
  if (!nodeB) return { error: 'Could not find "' + nameB + '".' };
  if (nodeA.id === nodeB.id) return { error: 'That\'s the same person!' };

  var nodeById = {};
  nodesGlobal.forEach(function (n) { nodeById[n.id] = n; });

  // Collect A's ancestors in order (A first, root last)
  var ancestorsA = [];
  var cur = nodeA;
  while (cur) { ancestorsA.push(cur.id); cur = cur.big ? nodeById[cur.big.id] : null; }

  // Walk B's chain until hitting an ancestor of A
  var pathB = [];
  var ancestorSetA = new Set(ancestorsA);
  cur = nodeB;
  while (cur && !ancestorSetA.has(cur.id)) { pathB.push(cur.id); cur = cur.big ? nodeById[cur.big.id] : null; }
  if (!cur) return { error: 'No common ancestor found.' };

  var lca = cur;
  var pathA = ancestorsA.slice(0, ancestorsA.indexOf(lca.id));

  return { nodeA: nodeA, nodeB: nodeB, lca: lca, pathA: pathA, pathB: pathB, nodeById: nodeById };
}

/* istanbul ignore next */
function describeConnection(result) {
  var da = result.pathA.length, db = result.pathB.length;
  var a = result.nodeA.name.split(' ')[0], b = result.nodeB.name.split(' ')[0];

  function bigTitle(n) {
    if (n === 0) return '';
    if (n === 1) return 'grand-';
    return 'great-'.repeat(n - 1) + 'grand-';
  }

  if (da === 0 && db > 0) return b + ' is ' + a + '\'s ' + bigTitle(db - 1) + 'little.';
  if (db === 0 && da > 0) return a + ' is ' + b + '\'s ' + bigTitle(da - 1) + 'little.';
  if (da === 1 && db === 1) return a + ' and ' + b + ' are line brothers — same big (' + result.lca.name + ').';
  if (da === 1 && db === 2) return b + ' is ' + a + '\'s nephew/niece in the line (one generation apart through ' + result.lca.name + ').';
  if (da === 2 && db === 1) return a + ' is ' + b + '\'s nephew/niece in the line (one generation apart through ' + result.lca.name + ').';
  var cousins = Math.min(da, db) - 1;
  var removed = Math.abs(da - db);
  var label = cousins === 1 ? 'cousins' : (cousins === 2 ? 'second cousins' : 'cousins (' + cousins + 'x)');
  if (removed > 0) label += ' ' + removed + 'x removed';
  return a + ' and ' + b + ' are ' + label + ' through ' + result.lca.name + '.';
}

var lineageRemovedNodeIds = [];
var lineageRemovedEdgeData = [];

/* istanbul ignore next */
// This section is intended to only run in the browser, it does not run in
// nodejs.
if (typeof document !== 'undefined') {
  $(document).ready(function () {
    // Reset checkboxes on load so filters don't appear active without being applied
    document.getElementById('activeonly').checked = false;
    document.getElementById('hidesolos').checked = false;

    // Start the first draw
    draw();

    // Search feature
    var removedNodeIds = [];
    var removedEdgeData = [];

    function applyActiveFilter() {
      var activeIds = getActiveFamilyLineNodeIds();
      removedNodeIds = nodesGlobal
        .filter(function (n) { return !activeIds.has(n.id); })
        .map(function (n) { return n.id; });
      var inactiveSet = new Set(removedNodeIds);
      removedEdgeData = edgesDataSet.get({
        filter: function (e) { return inactiveSet.has(e.from) || inactiveSet.has(e.to); },
      });
      nodesDataSet.remove(removedNodeIds);
      edgesDataSet.remove(removedEdgeData.map(function (e) { return e.id; }));
      network.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
    }

    function removeActiveFilter() {
      var nodesToRestore = nodesGlobal.filter(function (n) { return removedNodeIds.includes(n.id); });
      nodesDataSet.add(nodesToRestore);
      edgesDataSet.add(removedEdgeData);
      removedNodeIds = [];
      removedEdgeData = [];
      network.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
    }

    var dropdown = document.getElementById('layout');
    dropdown.onchange = function () {
      if (document.getElementById('activeonly').checked) {
        removeActiveFilter();
        draw();
        applyActiveFilter();
      } else {
        draw();
      }
    };

    var filtersMenu = document.getElementById('filters-menu');
    var toolsMenu = document.getElementById('tools-menu');

    document.getElementById('filters-toggle').onclick = function (e) {
      e.stopPropagation();
      filtersMenu.classList.toggle('open');
      toolsMenu.classList.remove('open');
    };
    document.getElementById('tools-toggle').onclick = function (e) {
      e.stopPropagation();
      toolsMenu.classList.toggle('open');
      filtersMenu.classList.remove('open');
    };
    document.addEventListener('click', function () {
      filtersMenu.classList.remove('open');
      toolsMenu.classList.remove('open');
    });
    filtersMenu.addEventListener('click', function (e) { e.stopPropagation(); });
    toolsMenu.addEventListener('click', function (e) { e.stopPropagation(); });

    document.getElementById('activeonly').onchange = function () {
      if (this.checked) {
        applyActiveFilter();
      } else {
        removeActiveFilter();
        resetColors();
      }
    };

    var removedSoloIds = [];
    function applySoloFilter() {
      var hasLittles = new Set();
      nodesGlobal.forEach(function (n) { if (n.big) hasLittles.add(n.big.id); });
      removedSoloIds = nodesGlobal
        .filter(function (n) { return !n.big && !n.isVirtual && !n.isHonorary && !hasLittles.has(n.id); })
        .map(function (n) { return n.id; });
      nodesDataSet.remove(removedSoloIds);
      network.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
    }
    function removeSoloFilter() {
      var nodesToRestore = nodesGlobal.filter(function (n) { return removedSoloIds.includes(n.id); });
      nodesDataSet.add(nodesToRestore);
      removedSoloIds = [];
      network.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
    }
    document.getElementById('hidesolos').onchange = function () {
      if (this.checked) {
        applySoloFilter();
      } else {
        removeSoloFilter();
        resetColors();
      }
    };
    function hidePrevNextButtons() {
      $('#prevsearch').css('display', 'none');
      $('#nextsearch').css('display', 'none');
    }
    function showPrevNextButtons() {
      $('#prevsearch').css('display', 'inline');
      $('#nextsearch').css('display', 'inline');
    }
    function search(direction) {
      if (direction !== DIRECTION.FORWARD && direction !== DIRECTION.BACKWARD) {
        console.warn('Unexpected direction value: ' + direction
          + ' (defaulting to FORWARD direction)');
        direction = DIRECTION.FORWARD;
      }
      direction = direction || DIRECTION.FORWARD;
      var query = $('#searchbox').val();

      // Check if query matches a class name or pledge class identifier
      if (query) {
        var lowerQuery = query.toLowerCase();
        var classMatch = null;
        nodesGlobal.forEach(function (n) {
          if (!classMatch && n.pledgeclass) {
            if ((n.className && n.className.toLowerCase() === lowerQuery) ||
                n.pledgeclass.toLowerCase() === lowerQuery) {
              classMatch = n.pledgeclass;
            }
          }
        });
        if (classMatch) {
          showClassPanel(classMatch);
          $('#searchbox').css('background-color', 'white');
          hidePrevNextButtons();
          return;
        }
      }

      var success = findBrotherHelper(query, direction);

      // Indicate if the search succeeded or not.
      if (success) {
        $('#searchbox').css('background-color', 'white');
        if (query !== '') {
          showPrevNextButtons();
        } else {
          hidePrevNextButtons();
        }
      } else {
        $('#searchbox').css('background-color', '#EEC4C6'); // red matching flag
        hidePrevNextButtons();
      }
    }
    document.getElementById('searchbox').onkeypress = function (e) {
      if (!e) e = window.event;
      var keyCode = e.keyCode || e.which;
      if (typeof keyCode === 'string') {
        keyCode = Number(keyCode);
      }
      if (keyCode === KEYCODE_ENTER && !e.shiftKey) {
        search(DIRECTION.FORWARD);
      }
      if (keyCode === KEYCODE_ENTER && e.shiftKey) {
        search(DIRECTION.BACKWARD);
      }
    };
    document.getElementById('searchbutton').onclick = search.bind(undefined, DIRECTION.FORWARD);
    document.getElementById('nextsearch').onclick = search.bind(undefined, DIRECTION.FORWARD);
    document.getElementById('prevsearch').onclick = search.bind(undefined, DIRECTION.BACKWARD);
    document.getElementById('info-panel-close').onclick = closeInfoPanel;

    document.getElementById('info-panel').addEventListener('click', function (e) {
      if (e.target.classList.contains('class-link')) {
        showClassPanel(e.target.dataset.pledgeClass);
        return;
      }
      var target = e.target.closest('[data-node-id]');
      if (!target) return;
      var nodeId = parseInt(target.dataset.nodeId, 10);
      showInfoPanel(nodeId);
      if (nodesDataSet.get(nodeId)) {
        network.focus(nodeId, { scale: 0.9, animation: true });
        network.selectNodes([nodeId]);
      }
    });

    document.getElementById('class-panel-close').onclick = closeClassPanel;
    document.getElementById('class-panel-back').onclick = closeClassPanel;

    document.getElementById('class-panel').addEventListener('click', function (e) {
      // Navigate to an adjacent class
      var classTarget = e.target.closest('[data-pledge-class]');
      if (classTarget) {
        showClassPanel(classTarget.dataset.pledgeClass);
        return;
      }
      // Navigate to a member — close class panel and open their info
      var memberTarget = e.target.closest('[data-node-id]');
      if (!memberTarget) return;
      var nodeId = parseInt(memberTarget.dataset.nodeId, 10);
      closeClassPanel();
      showInfoPanel(nodeId);
      if (nodesDataSet.get(nodeId)) {
        network.focus(nodeId, { scale: 0.9, animation: true });
        network.selectNodes([nodeId]);
      }
    });

    // Stats panel
    document.getElementById('stats-button').onclick = showStatsPanel;
    document.getElementById('stats-panel-close').onclick = closeStatsPanel;

    // Lineage view
    document.getElementById('info-panel-lineage').onclick = function () {
      if (currentInfoNodeId == null) return;
      closeInfoPanel();
      applyLineageFilter(currentInfoNodeId);
    };
    document.getElementById('lineage-exit').onclick = function () {
      removeLineageFilter();
    };

    // Connection finder
    function openConnectionPanel() {
      document.getElementById('connection-panel').classList.add('open');
    }
    function closeConnectionPanel() {
      document.getElementById('connection-panel').classList.remove('open');
      document.getElementById('connection-result').innerHTML = '';
      document.getElementById('connection-name-a').value = '';
      document.getElementById('connection-name-b').value = '';
    }
    function runConnectionSearch() {
      var nameA = document.getElementById('connection-name-a').value.trim();
      var nameB = document.getElementById('connection-name-b').value.trim();
      if (!nameA || !nameB) return;
      var result = findConnection(nameA, nameB);
      var el = document.getElementById('connection-result');
      if (result.error) {
        el.innerHTML = '<p style="color:#A51C30;margin:0">' + result.error + '</p>';
        return;
      }
      // Highlight path on tree
      var pathNodes = result.pathA.concat([result.lca.id]).concat(result.pathB);
      var pathSet = new Set(pathNodes);
      nodesGlobal.forEach(function (n) {
        if (n.isVirtual || n.isHonorary) return;
        n.color = pathSet.has(n.id) ? 'lightblue' : '#d3d3d3';
        nodesDataSet.update(n);
      });
      network.selectNodes(pathNodes);

      // Build path display: nodeA → ... → lca → ... → nodeB
      // pathA = [nodeA.id, nodeA's big, ..., lca's child on A's side]
      // pathB = [nodeB.id, nodeB's big, ..., lca's child on B's side]
      var displayPath = result.pathA.concat([result.lca.id]).concat(result.pathB.slice().reverse());

      var html = '<p style="margin:0 0 8px">' + describeConnection(result) + '</p>';
      html += '<div class="connection-path">';
      displayPath.forEach(function (id, i) {
        var n = result.nodeById[id];
        html += '<span class="connection-path-node" data-node-id="' + id + '">' + n.name + '</span>';
        if (i < displayPath.length - 1) html += '<span class="connection-path-arrow">→</span>';
      });
      html += '</div>';
      el.innerHTML = html;
    }
    document.getElementById('connection-button').onclick = openConnectionPanel;
    document.getElementById('connection-panel-close').onclick = closeConnectionPanel;
    document.getElementById('connection-search').onclick = runConnectionSearch;
    document.getElementById('connection-name-b').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') runConnectionSearch();
    });
    document.getElementById('connection-panel').addEventListener('click', function (e) {
      var target = e.target.closest('[data-node-id]');
      if (!target) return;
      var nodeId = parseInt(target.dataset.nodeId, 10);
      closeConnectionPanel();
      showInfoPanel(nodeId);
      if (nodesDataSet.get(nodeId)) { network.focus(nodeId, { scale: 0.9, animation: true }); network.selectNodes([nodeId]); }
    });
    addSwipeToClose(document.getElementById('connection-panel'), closeConnectionPanel);
    document.getElementById('stats-panel').addEventListener('click', function (e) {
      var classTarget = e.target.closest('[data-pledge-class]');
      if (classTarget) { closeStatsPanel(); showClassPanel(classTarget.dataset.pledgeClass); return; }
      var nodeTarget = e.target.closest('[data-node-id]');
      if (nodeTarget) {
        var nodeId = parseInt(nodeTarget.dataset.nodeId, 10);
        closeStatsPanel();
        showInfoPanel(nodeId);
        if (nodesDataSet.get(nodeId)) {
          network.focus(nodeId, { scale: 0.9, animation: true });
          network.selectNodes([nodeId]);
        }
      }
    });

    // Swipe down to close bottom panels on mobile
    function addSwipeToClose(panelEl, closeFn) {
      var startY = 0;
      panelEl.addEventListener('touchstart', function (e) {
        startY = e.touches[0].clientY;
      }, { passive: true });
      panelEl.addEventListener('touchend', function (e) {
        var deltaY = e.changedTouches[0].clientY - startY;
        if (deltaY > 60 && panelEl.scrollTop === 0) closeFn();
      }, { passive: true });
    }
    addSwipeToClose(document.getElementById('info-panel'), function () { closeInfoPanel(); resetColors(); });
    addSwipeToClose(document.getElementById('class-panel'), closeClassPanel);
    addSwipeToClose(document.getElementById('stats-panel'), closeStatsPanel);

    // Keyboard shortcuts
    document.addEventListener('keydown', function (e) {
      var tag = document.activeElement.tagName.toLowerCase();
      var isInput = tag === 'input' || tag === 'textarea' || tag === 'select';

      if (e.key === 'Escape') {
        if (document.getElementById('class-panel').classList.contains('open')) {
          closeClassPanel();
        } else if (document.getElementById('info-panel').classList.contains('open')) {
          closeInfoPanel(); resetColors();
        } else if (document.getElementById('stats-panel').classList.contains('open')) {
          closeStatsPanel();
        }
        return;
      }

      if (isInput) return;

      if (e.key === '/') {
        e.preventDefault();
        document.getElementById('searchbox').focus();
        return;
      }

      // Arrow navigation within the info panel
      if (!document.getElementById('info-panel').classList.contains('open') || currentInfoNodeId == null) return;
      var curNode = nodesGlobal.find(function (n) { return n.id === currentInfoNodeId; });
      if (!curNode) return;

      if (e.key === 'ArrowUp' && curNode.big) {
        e.preventDefault();
        var bigId = curNode.big.id;
        showInfoPanel(bigId);
        if (nodesDataSet.get(bigId)) { network.focus(bigId, { scale: 0.9, animation: true }); network.selectNodes([bigId]); }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        var firstLittle = nodesGlobal.find(function (n) { return n.big && n.big.id === currentInfoNodeId; });
        if (firstLittle) {
          showInfoPanel(firstLittle.id);
          if (nodesDataSet.get(firstLittle.id)) { network.focus(firstLittle.id, { scale: 0.9, animation: true }); network.selectNodes([firstLittle.id]); }
        }
      }
    });

    document.getElementById('zoom-in').onclick = function () {
      if (!network) return;
      network.moveTo({ scale: network.getScale() * 1.45, animation: { duration: 200, easingFunction: 'easeInOutQuad' } });
    };
    document.getElementById('zoom-out').onclick = function () {
      if (!network) return;
      network.moveTo({ scale: network.getScale() / 1.45, animation: { duration: 200, easingFunction: 'easeInOutQuad' } });
    };
    document.getElementById('zoom-fit').onclick = function () {
      if (!network) return;
      network.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
    };
  });
}

/* istanbul ignore else */
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports.createNodes = createNodes;
  module.exports.createNodesHelper = createNodesHelper;
  module.exports.findBrother = findBrother;
  module.exports.DIRECTION = DIRECTION;
}