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

function getNewBranchColor() {
  var color = new tinycolor({ h: Math.random() * 360, s: 0.5, v: 0.9 });
  return color.toHexString();
}

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
  var newIdx = oldLength;

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

    bro.label = `${bro.name}\n${bro.className || ''}\n${bro.pledgeclass || ''}`; // Display the name in the graph

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

  // re-process the brothers
  // Color all the nodes (according to this color scheme)
  nodes.forEach(function (node) {
    // No longer handling inactive or active status
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
    return element.name.toLowerCase().includes(lowerCaseName);
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
    return true;
  }
  return false; // Could not find a match
}

/* istanbul ignore next */
function draw() {
  createNodesHelper();

  var changeColor;
  var colorMethod = document.getElementById('layout').value;
  switch (colorMethod) {
    case 'pledgeClass':
      changeColor = function (node) {
        node.color = node.pledgeclass
          ? pledgeClassColorGlobal[node.pledgeclass.toLowerCase()]
          : 'lightgrey';
        nodesDataSet.update(node);
      };
      break;
    case 'brotherStatus':
      changeColor = function (node) {
        node.color = node.graduated ? '#d3d3d3' : 'lightblue'; // Use lighter gray
        nodesDataSet.update(node);
      };
      break;
    case 'branches':
      var branchColors = assignBranchColors(nodesGlobal);
      changeColor = function (node) {
        node.color = branchColors[node.id];
        nodesDataSet.update(node);
      };
      break;
    default:
      changeColor = function (node) {
        node.color = 'lightgrey';
        nodesDataSet.update(node);
      };
      break;
  }
  nodesGlobal.forEach(changeColor);
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
          nodeSpacing: 175, // Adjust the spacing between nodes
          levelSeparation: 125 // Adjust the separation between levels
        },
      },
      edges: {
        smooth: true,
        arrows: { to: true },
      },
      physics: {
        hierarchicalRepulsion: {
          nodeDistance: 125 // Adjust the distance between nodes
        }
      }
    };
    network = new vis.Network(container, data, options);
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
    var dropdown = document.getElementById('layout');
    dropdown.onchange = function () {
      draw();
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
  });
}

/* istanbul ignore else */
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports.createNodes = createNodes;
  module.exports.createNodesHelper = createNodesHelper;
  module.exports.findBrother = findBrother;
  module.exports.DIRECTION = DIRECTION;
}