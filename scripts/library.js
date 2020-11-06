//const api_server = "network-viz.chpc.utah.edu:5000"
const api_server = 'localhost:5000';
const tr_api = "/api/v1/resources/traceroutes";

const runTraceroute = async (source, dest, num_runs) => {
    let api_call = `http://${api_server}${tr_api}?dest=${dest}`;
    if (source) {
        api_call += `&source=${source}`;
    }
    api_call += `&num_runs=${num_runs}`;
    console.log(`Requesting ${api_call}`);
    let result = await d3.json(api_call);
    return result;
};

const rdap_api = "/api/v1/resources/iporgs"
const getOrgFromIP = async (ip) => {
    let api_call = `http://${api_server}${rdap_api}?ip=${ip}`;
    console.log(`Requesting ${api_call}`);
    const result = await d3.json(api_call);
    return result;
}

const getMaxBWFromGRNOCIP = async (ip) => {
    if (ip.startsWith("198") || ip.startsWith("162") || ip.startsWith("192")) {
        console.log(`startswith ${ip}`);
        let api_call = `https://snapp-portal.grnoc.iu.edu/tsds-cross-domain/query.cgi?method=query;query=get%20max_bandwidth%20between(now-10m,%20now)%20from%20interface%20where%20interface_address.value%20=%20%22${ip}%22`;
        console.log(`Requesting ${api_call}`);
        const result = await d3.json(api_call);
        return result;
    } else {
        return {'results' : []};
    }

}

const getATRChartURL = (ip, start = 1588478400000, end = 1588564799000) => {
    if (ip.startsWith("198") || ip.startsWith("162") || ip.startsWith("192")) {
        return `https://snapp-portal.grnoc.iu.edu/grafana/d-solo/f_KR9xeZk/ip-address-lookup?orgId=2&from=${start}&to=${end}&var-ip_addr=${ip}&panelId=2`;
    }
    return "";
}

const createInternetGraph = async (traceroutes, existing = undefined) => {
    let entities = existing;
    if (entities == undefined) {
        entities = new Map();
    }

    for (var trace of traceroutes) {
        const packets = trace.packets;
        for (let i = 0; i < packets.length; i++) {
            if (packets[i].ip == undefined)
                packets[i].ip = "unknown";
        }
        for (let i = 0; i < packets.length; i++) {
            const packet = packets[i];
            packet.ts = trace.ts;
            const entity_id = `ip(${packet.ip})`;
            let entity = entities.get(entity_id);

            if (!entity) {
                const orgResult = await getOrgFromIP(packet.ip);
                const tsdsResult = await getMaxBWFromGRNOCIP(packet.ip);
                let maxBW = undefined;
                if (tsdsResult.results.length > 0) {
                    maxBW = tsdsResult.results[0].max_bandwidth;
                    console.log(packet.ip, maxBW);
                }
                entity = ({
                    id: entity_id,
                    ip: packet.ip,
                    org: orgResult.org,
                    domain: orgResult.domain,
                    max_bandwidth: packet.speed ? packet.speed: maxBW,
                    packets: new Array(),
                    source_ids: new Set(),
                    target_ids: new Set()
                });
                entities.set(entity_id, entity);
            }

            entity.packets.push(packet);
            if (i > 0)
                entity.source_ids.add(`ip(${packets[i - 1].ip})`);
            if (i < packets.length - 1)
                entity.target_ids.add(`ip(${packets[i + 1].ip})`);
        }
    }

    return entities;
};

const mergeInternetGraphs = (graph1, graph2) => {
    // Start with a "deep" copy of graph 1 (packets memory is not copied)
    let graph = new Map();
    for (const [entity_id, entity] of graph1.entries()) {
        const entity_copy = ({
            id: entity.id,
            ip: entity.ip,
            org: entity.org,
            packets: Array.from(entity.packets),
            source_ids: new Set(entity.source_ids),
            target_ids: new Set(entity.target_ids)
        });
        graph.set(entity_id, entity_copy)
    }
    // Update with graph 2
    for (const [entity_id, entity] of graph2.entries()) {
        if (graph.has(entity_id)) {
            let existing = graph.get(entity_id);
            existing.packets = existing.packets.concat(entity.packets);
            for (let ntt of entity.source_ids) {
                existing.source_ids.add(ntt);
            }
            for (let ntt of entity.target_ids) {
                existing.target_ids.add(ntt);
            }
        } else {
            const entity_copy = ({
                id: entity.id,
                ip: entity.ip,
                org: entity.org,
                packets: Array.from(entity.packets),
                source_ids: new Set(entity.source_ids),
                target_ids: new Set(entity.target_ids)
            });
            graph.set(entity_id, entity_copy)
        }
    }
    return graph;
}

// clusterBy takes a map of entities with an "id" property and returns a map of new entities that reference the input entities as children. Clustering is breadth-first driven by the given label equality, degree, and relationship parameters.
const clusterBy = (entities, getLabel, getRelationships, id_prefix = undefined, max_degree = 1) => {
    const result = new Map();

    // Helper method for cleanliness
    const addToCluster = (cluster_id, entity) => {
        if (!result.has(cluster_id)) {
            // Use ES6 Proxy to recursively access properties of hierarchical clusters (see `handler` def)
            result.set(cluster_id, new Proxy(({id: cluster_id, children: new Map()}), handler));
        }
        result.get(cluster_id).children.set(entity.id, entity);
    }

    // If max_degree is 0, basically return the input
    if (max_degree == 0) {
        for (var [id, entity] of entities) {
            addToCluster(id, entity);
        }
    }
    // If max_degree is Infinity, basically do a "groupBy"
    else if (max_degree == Infinity) {
        for (var [id, entity] of entities) {
            addToCluster(getLabel(entity), entity);
        }
    }
    // Otherwise, exhaustive search (depth-first) for connected clusters of degree `max_degree`
    else {
        const orphan_ids = Array.from(entities.keys());
        const cluster_count = new Map();

        let i = 0;
        while (i < orphan_ids.length) {
            // Start a new cluster from an unclustered entity
            const orphan = entities.get(orphan_ids[i]);
            const label = getLabel(orphan);

            // Disjoint clusters of the same label are enumerated for distinctness
            if (!cluster_count.has(label))
                cluster_count.set(label, 0);
            cluster_count.set(label, cluster_count.get(label) + 1);
            let cluster_id = id_prefix ? `${id_prefix}(${label})` : label;
            cluster_id += ` cluster-${cluster_count.get(label)}`;

            let candidates = [orphan_ids[i]];
            const visited = new Set();

            while (candidates.length > 0) {
                const candidate_id = candidates.pop();
                const candidate = entities.get(candidate_id);

                if (!visited.has(candidate_id)) {
                    visited.add(candidate_id); // Don't check this candidate again for this cluster
                    if (getLabel(candidate) == label) {
                        // Found a match
                        addToCluster(cluster_id, candidate);
                        const neighbors = Array.from(getRelationships(candidate));
                        candidates = candidates.concat(neighbors); // Add neighbors as new search candidates
                        //TODO add support for max_degree > 1 (recursive neighbors), probably change candidates to a Set a the same time
                        orphan_ids.splice(orphan_ids.indexOf(candidate_id), 1); // This entity now belongs to a cluster
                    }
                }
            }
        }
    }
    return result;
};

const propReducer = (property) => {
    let f = null;
    switch (property) {
        case "source_ids":
        case "target_ids":
            f = (a, b) => new Set([...a, ...b]);
            break;
        case "packets":
            f = (a, b) => a.concat(b);
            break;
        default:
            f = (a, b) => a == b ? a : undefined;
    }
    return f;
}

// If property is not present and the object has an array of child nodes, return an appropriate reduction
// of that property across all children
const handler = ({
    get: (obj, property) => property in obj
        ? obj[property]
        : (obj.children ? Array.from(obj.children.values())
                .map(child => child[property])
                .reduce((acc, value) => propReducer(property)(acc, value))
            : undefined)
})


class Vizualization {
    constructor(root_element, width = 800, height = 800) {
        this.width = width;
        this.height = height;
        this.node_data = new Map();
        this.node_visual_alias = new Map();
        this.atr_iframes = new Map();
        // Initialize DOM elements
        this.svg = d3.select(root_element).append("svg")
            .attr("width", width)
            .attr("height", height)
            .style('display', 'block')
            .style('margin', 'auto');
        // .style('transform', 'translate(100%, 0)')
        // .attr("align", "center");

        this.tooltip = d3.select(root_element).append("div")
            .attr("id", "tooltip")
            .attr("style", "position: absolute; opacity: 0;");

        this.tooltip_stats = this.tooltip.append("div");

        this.svg.append("svg:defs").selectAll("marker")
            .data(["end"])      // Different link/path types can be defined here
            .enter().append("svg:marker")    // This section adds in the arrows
            .attr("id", String)
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 23)
            .attr("refY", 0)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
            .append("svg:path")
            .attr("d", "M0,-5L10,0L0,5");

        this.link = this.svg.append("g")
            .attr("stroke", "#999")
            .attr("stroke-opacity", 0.6)
            .attr("marker-end", "url(#end)")
            .selectAll("line");

        this.node = this.svg.append("g")
            .attr("stroke", "#fff")
            .attr("stroke-width", 1.5)
            .selectAll("circle");

        // Initialize interactivity
        this.simulation = d3.forceSimulation()
            .force("link", d3.forceLink().id())
            .force("charge", d3.forceManyBody())
            .force("center", d3.forceCenter(width / 2, height / 2));

        this.simulation.on("tick", () => {
            this.link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            this.node.attr("transform", function (d) {
                return "translate(" + d.x + "," + d.y + ")";
            });
        });
    }

    collapseNode(node) {
        const _collapse = (child) => {
            child.expanded = false;
            this.node_visual_alias.set(child.id, node.id)
            if (child.children) {
                for (var [id, child] of child.children) {
                    _collapse(child);
                }
            }
        };
        _collapse(node);
    }

    expandNode(node) {
        node.expanded = true;
        if (node.children) {
            for (var [id, child] of node.children) {
                this.collapseNode(child);
            }
        }
    }

    getNodeColorOrg(node) {
        const domain = d3.map([...this.node_data.values()], v => v.org).keys();
        const scale = d3.scaleOrdinal(d3.schemeCategory10).domain(domain);
        return scale(node.org);
    }

    getNodeRadiusPackets(node) {
        const scale = d3.scaleLinear().domain([1, d3.max([...this.node_data.values()], v => v.packets.length)]).range([16, 24]);
        return scale(node.packets.length)
    }

    flattenNodeData() {
        let flat_data = new Map();
        const _flatten = (child) => {
            flat_data.set(child.id, child)
            if (child.children) {
                for (var [id, child] of child.children) {
                    _flatten(child);
                }
            }
        };
        for (let [id, entity] of this.node_data) {
            _flatten(entity)
        }
        return flat_data;
    }

    _drag() {
        let simulation = this.simulation;

        function dragstarted(d) {
            if (!d3.event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }

        function dragged(d) {
            d.fx = d3.event.x;
            d.fy = d3.event.y;
        }

        function dragended(d) {
            if (!d3.event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }

        return d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended);
    }

    setData(data) {
        this.node_data = data;
        this.all_nodes = this.flattenNodeData();

        for (var [k, v] of this.node_data) {
            v.expanded = false;
            this.node_visual_alias.set(k, k);
            if (v.children) {
                for (var [kk, vv] of v.children) {
                    vv.expanded = false;
                    this.node_visual_alias.set(kk, k);
                }
            }
        }

        this.update();
    }

    netbeamGraph(trafficInfo) {
        let margin = {top: 10, right: 30, bottom: 30, left: 60};

        let oWidth = 600;
        let oHeight = 300;

        let width = oWidth - margin.left - margin.right;
        let height = oHeight - margin.top - margin.bottom;

        let trafficGraph = d3.select('#tooltip')
            .append('svg')
            .attr('width', oWidth)
            .attr('height', oHeight)
            .append('g')
            .attr('transform', `translate(${margin.left}, ${margin.top})`);

        let xScale = d3.scaleLinear()
            .domain(d3.extent([...trafficInfo.keys()]))
            .range([0, width]);
        trafficGraph.append('g')
            .attr('id', 'xaxis')
            .attr('transform', `translate(0, ${height})`)
            .call(d3.axisBottom(xScale)
                .ticks(10)
                .tickFormat(d => {
                    let date = new Date(d);
                    return `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
                }));

        let valsArr = [...trafficInfo.values()];

        let min = d3.min(valsArr.map(d => Math.min(d.in, d.out)));
        let max = d3.max(valsArr.map(d => Math.max(d.in, d.out)));

        console.log(`Min: ${min}, Max: ${max}`);

        let yScale = d3.scaleLinear()
            .domain([min, max])
            .range([height, 0]);
        trafficGraph.append('g')
            .attr('id', 'yaxis')
            .call(d3.axisLeft(yScale)
                .ticks(6)
                .tickFormat(d => d3.format('~s')(d)));

        // Set up legend
        let inLegend = trafficGraph.append('g')
            .attr('id', 'inLegend')
            .attr('transform', `translate(${width - 50}, 10)`);
        inLegend.append('text')
            .attr('style', 'font: 12px sans-serif;')
            .attr('opacity', 0.75)
            .text('in:');
        inLegend.append('line')
            .attr('x1', 0)
            .attr('x2', 20)
            .attr('y1', 0)
            .attr('y2', 0)
            .attr('stroke', 'steelblue')
            .attr('stroke-width', '1.5px')
            .attr('transform', `translate(30, -5)`);
        inLegend.append('circle')
            .attr('cx', 40)
            .attr('cy', -5)
            .attr('fill', 'steelblue')
            .attr('r', 1.5);

        let outLegend = trafficGraph.append('g')
            .attr('id', 'outLegend')
            .attr('transform', `translate(${width - 50}, 20)`);
        outLegend.append('text')
            .attr('style', 'font: 12px sans-serif;')
            .attr('opacity', 0.75)
            .text('out:');
        outLegend.append('line')
            .attr('x1', 0)
            .attr('x2', 20)
            .attr('y1', 0)
            .attr('y2', 0)
            .attr('stroke', 'red')
            .attr('stroke-width', '1.5px')
            .attr('transform', `translate(30, -5)`);
        outLegend.append('circle')
            .attr('cx', 40)
            .attr('cy', -5)
            .attr('fill', 'red')
            .attr('r', 1.5);

        // Append path for in values
        trafficGraph.append('path')
            .attr('id', 'inLine')
            .datum(valsArr)
            .attr('fill', 'none')
            .attr('stroke', 'steelblue')
            .attr('stroke-width', 1.5)
            .attr('d', d3.line()
                .x(d => xScale(d.ts))
                .y(d => yScale(d.in))
                .curve(d3.curveMonotoneX));

        // Append path for out values
        trafficGraph.append('path')
            .attr('id', 'outLine')
            .datum(valsArr)
            .attr('fill', 'none')
            .attr('stroke', 'red')
            .attr('stroke-width', 1.5)
            .attr('d', d3.line()
                .x(d => xScale(d.ts))
                .y(d => yScale(d.out))
                .curve(d3.curveMonotoneX));

        // Append dots for in values
        trafficGraph.append('g')
            .attr('id', 'inCircs')
            .selectAll('circle')
            .data(valsArr)
            .join('circle')
            .attr('r', 1.5)
            .attr('fill', 'steelblue')
            .attr('cx', d => xScale(d.ts))
            .attr('cy', d => yScale(d.in));

        // Append dots for out values
        trafficGraph.append('g')
            .attr('id', 'outCircs')
            .selectAll('circle')
            .data(valsArr)
            .join('circle')
            .attr('r', 1.5)
            .attr('fill', 'red')
            .attr('cx', d => xScale(d.ts))
            .attr('cy', d => yScale(d.out));
    }

    update() {
        this.simulation.stop()
        this.vNodes = Array.from(this.node_data.values());
        // for (let node of this.vNodes)
        // {
        //     this.expandNode(node);
        // }

        //this.vNodes = Array.from(this.all_nodes.values());
        this.vLinks = new Array();

        let i = 0;
        while (i < this.vNodes.length) {
            if (this.vNodes[i].expanded && this.vNodes[i].children) {
                for (let child of this.vNodes[i].children.values()) {
                    // Inherit cluster's position in graph to avoid visual chaos
                    if (child.x == undefined) {
                        child.x = this.vNodes[i].x;
                        child.y = this.vNodes[i].y;
                        child.vx = this.vNodes[i].vx;
                        child.vy = this.vNodes[i].vy;
                    }
                    this.vNodes.push(child);
                }
                this.vNodes.splice(i, 1);
            } else {
                i += 1;
            }
        }

        // Preload ATR Grafana iFrames for rendered IP nodes
        for (let d of this.vNodes) {
            if (d.id.startsWith("ip") && !this.atr_iframes.has(d.id)) {
                const URL = getATRChartURL(d.ip);
                if (URL.length > 0) {
                    const iframe = this.tooltip.append("iframe")
                        .attr("width", 450)
                        .attr("height", 200)
                        .style("display", "none");
                    iframe.attr("src", getATRChartURL(d.ip));
                    this.atr_iframes.set(d.id, iframe);
                }
            }
        }

        for (let d of this.vNodes) {
            let target_aliases = new Set();
            if (d.target_ids) {
                for (let t of d.target_ids) {
                    target_aliases.add(this.node_visual_alias.get(t));
                }
                for (let t of target_aliases) {
                    if (d.id != t)
                        this.vLinks.push(({source: d, target: this.all_nodes.get(t)}));
                }
            }
        }

        this.node = this.node
            .data(this.vNodes, d => d.id)
            .join(enter => enter.append("g"));

        this.node.append("image")
            .attr("xlink:href", d => d.domain != "unknown" ? `http://icons.duckduckgo.com/ip2/${d.domain}.ico` : "")
            .attr("draggable", false)
            .attr("width", d => this.getNodeRadiusPackets(d))
            .attr("height", d => this.getNodeRadiusPackets(d))
            .attr("x", d => -1 * this.getNodeRadiusPackets(d) / 2)
            .attr("y", d => -1 * this.getNodeRadiusPackets(d) / 2);

        this.node.append("circle")
            .attr("r", d => this.getNodeRadiusPackets(d) / 2)
            .attr("fill", d => this.getNodeColorOrg(d))
            .attr("opacity", d => d.domain != "unknown" ? 0.0 : 1.0)
            .on("dblclick", d => {
                d3.event.preventDefault();
                this.expandNode(d);
                this.update();
            })
            .on("mouseover", (d) => {
                this.tooltip.transition().duration(200).style('opacity', 0.9);
                let packets = d.packets;

                let trafficInfo = new Map();

                for (let packet of packets) {
                    if (packet.resource) {
                        for (let traffic of packet.traffic) {
                            trafficInfo.set(traffic[0], {'ts': traffic[0], 'in': traffic[1], 'out': traffic[2]});
                        }
                    }
                }

                // (d.max_bandwidth / 1000000000.) + "Gbps |"

                this.tooltip_stats.text(`${d.ip ? d.ip : ""} (${d.org}) | ${packets.length} packets | ${d.max_bandwidth ? "Max bandwidth: " + d3.format('s')(d.max_bandwidth) + "bps |": ""} RTT (mean): ${d3.mean(packets, p => p.rtt)}`);
                if (d.id.startsWith("ip") && this.atr_iframes.has(d.id)) {
                    this.atr_iframes.get(d.id).style("display", "block");
                } else if (d.id.startsWith("ip") && trafficInfo.size > 0) {
                    this.netbeamGraph(trafficInfo);
                }

            })
            .on("mouseout", (d) => {
                this.tooltip.transition().duration(200).style('opacity', 0);
                if (d.id.startsWith("ip") && this.atr_iframes.has(d.id)) {
                    this.atr_iframes.get(d.id).style("display", "none");
                }
                this.tooltip.selectAll('svg').remove();
            })
            .on('mousemove', () => {
                this.tooltip.style('left', (d3.event.pageX + 10) + 'px').style('top', (d3.event.pageY + 10) + 'px')
            })
            .call(this._drag());

        this.link = this.link
            .data(this.vLinks)
            .join("line");

        this.simulation.nodes(this.vNodes);
        this.simulation.force("link", d3.forceLink(this.vLinks).id(d => d.id));
        this.simulation.alpha(1).restart();
    }
}
