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
  if (!node) return;
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

  document.getElementById('info-panel').classList.add('open');
}

/* istanbul ignore next */
function closeInfoPanel() {
  document.getElementById('info-panel').classList.remove('open');
  closeClassPanel();
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

  document.getElementById('class-panel').classList.add('open');
  highlightClassMembers(pledgeClass);
}

/* istanbul ignore next */
function closeClassPanel() {
  document.getElementById('class-panel').classList.remove('open');
}

/* istanbul ignore next */
function highlightClassMembers(pledgeClass) {
  var memberIds = nodesGlobal
    .filter(function (n) { return n.pledgeclass === pledgeClass; })
    .map(function (n) { return n.id; });

  nodesGlobal.forEach(function (node) {
    node.color = memberIds.includes(node.id) ? 'lightblue' : '#d3d3d3';
    nodesDataSet.update(node);
  });
  edgesGlobal.forEach(function (edge) {
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

  // Add big
  if (node.big) {
    highlightedNodes.push(node.big.id);
    var bigEdge = edgesGlobal.find(function (e) { return e.to === nodeId; });
    if (bigEdge) highlightedEdgeIds.add(bigEdge.id);
  }

  // Add littles
  nodesGlobal.forEach(function (n) {
    if (n.big && n.big.id === nodeId) {
      highlightedNodes.push(n.id);
      var littleEdge = edgesGlobal.find(function (e) { return e.to === n.id; });
      if (littleEdge) highlightedEdgeIds.add(littleEdge.id);
    }
  });

  nodesGlobal.forEach(function (n) {
    n.color = highlightedNodes.includes(n.id) ? 'lightblue' : '#d3d3d3';
    nodesDataSet.update(n);
  });
  edgesGlobal.forEach(function (e) {
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
    node.color = highlightedNodes.includes(node.id) ? 'lightblue' : '#d3d3d3';
    nodesDataSet.update(node);
  });

  edgesGlobal.forEach(edge => {
    edge.color = highlightedEdges.includes(edge) ? { color: 'lightblue' } : { color: '#d3d3d3' };
    edgesDataSet.update(edge);
  });
}

function getNodeColorFn(colorMethod) {
  switch (colorMethod) {
    case 'pledgeClass':
      return function (node) {
        node.color = node.pledgeclass
          ? pledgeClassColorGlobal[node.pledgeclass.toLowerCase()]
          : 'lightgrey';
        nodesDataSet.update(node);
      };
    case 'highlightCollegiates':
      return function (node) {
        node.color = node.graduated ? '#d3d3d3' : 'lightblue';
        nodesDataSet.update(node);
      };
    case 'branches':
      var branchColors = assignBranchColors(nodesGlobal);
      return function (node) {
        node.color = branchColors[node.id];
        nodesDataSet.update(node);
      };
    default:
      return function (node) {
        node.color = 'lightgrey';
        nodesDataSet.update(node);
      };
  }
}

function resetColors() {
  var colorMethod = document.getElementById('layout').value;
  nodesGlobal.forEach(getNodeColorFn(colorMethod));
  edgesGlobal.forEach(edge => {
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
    });

    network.on('doubleClick', function (params) {
      if (params.nodes.length > 0) {
        highlightBigs(params.nodes[0]);
      }
    });

    network.on('click', function (params) {
      if (params.nodes.length === 0) {
        resetColors();
        closeInfoPanel();
      } else {
        showInfoPanel(params.nodes[0]);
      }
    });
  } else {
    network.redraw();
  }
}

/* istanbul ignore next */
// This section is intended to only run in the browser, it does not run in
// nodejs.
if (typeof document !== 'undefined') {
  $(document).ready(function () {
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

    document.getElementById('activeonly').onchange = function () {
      if (this.checked) {
        applyActiveFilter();
      } else {
        removeActiveFilter();
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