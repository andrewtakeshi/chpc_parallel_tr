// let api_server = 'localhost:5000';
// let tr_api = '/api/v1/resources/traceroutes';
let altNTTs = ({'traceroutes': []});
let altHiddenNTTs = ({'traceroutes': []});

async function run_traceroute(source = undefined, dest, num_runs = 1, uuid) {
    let api_call = `http://${api_server}${tr_api}?dest=${dest}`;
    if (source) {
        api_call += `&source=${source}`;
    }
    api_call += `&num_runs=${num_runs}`;
    let result = await d3.json(api_call);

    document.getElementById(`${uuid}_status`).innerHTML = "Finished";
    for (let traceroute of result.traceroutes) {
        traceroute.id = uuid;
    }

    await netbeamTable(result.traceroutes);

    altNTTs.traceroutes = altNTTs.traceroutes.concat(result.traceroutes);

    return altNTTs.traceroutes;
}

class Node {
    constructor(parent, ip) {
        this.ip = ip;
        this.parentIP = parent;
        this.parentRef = null;
        this.children = new Set();
        this.level = -1;
        this.position = -1;
        this.count = 1;
    }

    addChild(childNode) {
        this.children.add(childNode);
    }
}

class NetworkGraph {
    constructor(data = [], div) {
        this.data = data;
        this.div = div;
        this.margin = {left: 25, right: 25, top: 25, bottom: 25};
        this.width = 800 - this.margin.left - this.margin.right;
        this.height = 500 - this.margin.top - this.margin.bottom;
        this.svg = d3.select(this.div)
            .append('svg')
            .style('display', 'block')
            .style('margin', 'auto')
            .attr('width', this.width)
            .attr('height', this.height);
        this.nodeGroup = this.svg.append('g')
            .classed('nodeGroup', true)
            .attr('id', 'nodeGroup')
            .attr('transform', `translate(${this.margin.left}, ${this.margin.right})`);
        this.linkGroup = this.svg.append('g')
            .classed('linkGroup', true)
            .attr('id', 'linkGroup')
            .attr('transform', `translate(${this.margin.left}, ${this.margin.right})`);
        this.links = new Map();
        this.nodes = new Map();
    }


    _assignPosition(node, position) {
        node.position = position;
        let iter = 0;
        for (let child of node.children.values()) {
            this._assignPosition(child, iter);
            iter++;
        }


        // let count = 0;
        // for (let i = 0; i < node.children.length; i++) {
        //     this._assignPosition(node.children[i], position + i + count);
        //     let child_child_len = node.children[i].children.length - 1;
        //     child_child_len = child_child_len >= 0 ? child_child_len : 0;
        //     count += child_child_len;
        // }
    }

    _assignLevel(node, level) {
        node.level = level;

        for (let node_child of node.children) {
            this._assignLevel(node_child, level + 1);
        }
        // for (let i = 0; i < node.children.length; i++) {
        //     if (level === 0 && i === node.children.length - 1) {
        //         return this._assignLevel(node.children[i], level + 1);
        //     } else {
        //         this._assignLevel(node.children[i], level + 1);
        //     }
        // }
        // return level + 1;
    }

    /**
     * Updates/creates the links & nodes maps
     */
    _updateGraphInfo() {
        // Taken from https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript
        let linkHash = s => s.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);

        // Updates links.
        for (let tr of this.data) {
            for (let packet of tr.packets) {
                let hashed = linkHash(packet.parent + packet.ip);
                if (this.links.has(hashed)) {
                    this.links.get(hashed).count += 1;
                } else {
                    this.links.set(hashed, {
                        source: packet.parent,
                        target: packet.ip,
                        count: 1
                    });
                }
            }
        }

        // Updates nodes.
        for (let tr of this.data) {
            for (let packet of tr.packets) {
                if (this.nodes.has(packet.ip)) {
                    this.nodes.get(packet.ip).count++;
                } else {
                    let node = new Node(packet.parent, packet.ip);
                    this.nodes.set(packet.ip, node);
                    // this.nodes.get(packet.ip).count++;
                }
            }
        }

        // Updates parent/child relationships.
        for (let node_parent of this.nodes.values()) {
            for (let node_child of this.nodes.values()) {
                if (node_child.parentIP === node_parent.ip) {
                    node_child.parentRef = node_parent;
                    node_parent.addChild(node_child);
                }
            }
        }

        // Updates position and level
        for (let node of this.nodes.values()) {
            let startLevel = 0;
            if (node.parentRef === null) {
                this._assignLevel(node, 0);
                this._assignPosition(node, 0);
            }
        }
    }

    /**
     * Updates the visualization
     * @param data - Updated data
     */
    UpdateViz(data) {
        // Contains just the data
        this.data = data;
        console.log(this.data);

        this._updateGraphInfo();
        console.log(this.links);
        console.log(this.nodes);

        let maxLevel = 0;
        let maxPos = 0;
        let maxCount = 1;

        for (let node of this.nodes.values()) {
            if (node.level > maxLevel) {
                maxLevel = node.level;
            }
            if (node.position > maxPos) {
                maxPos = node.position;
            }
            if (node.count > maxCount)
            {
                maxCount = node.count;
            }
        }

        let levelMult = this.height / (maxLevel + 1);
        let posMult = this.width / (maxPos + 1);

        let rScale = d3.scaleSqrt()
            .domain([1, maxCount])
            .range([2, 5]);

        this.nodeGroup.selectAll('circle')
            .data(this.nodes.values())
            .join('circle')
            .attr('cx', d => d.position * posMult)
            .attr('cy', d => d.level * levelMult)
            .attr('r', d => rScale(d.count))
            .attr('fill', 'black')
            .attr('stroke', 'black')
            .attr('stroke-width', '1px');

        this.nodeGroup.attr('transform', `translate(${this.margin.left}, ${this.margin.top})`);

        // this.nodeGroup.attr('transform', `translate(${this.margins.top}, ${this.margins.left})`);

        // Links should contain to, from, and the number of hops running through the link

    }
}
