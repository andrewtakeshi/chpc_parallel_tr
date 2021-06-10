//const api_server = 'network-viz.chpc.utah.edu:5000'
const api_server = '127.0.0.1:8081';
const tr_api = '/api/v1/resources/traceroutes';
const rdap_api = '/api/v1/resources/iporgs'

const runTraceroute = async (source, dest, num_runs) => {
    let api_call = `http://${api_server}${tr_api}?dest=${dest}`;
    if (source) {
        api_call += `&source=${source}`;
    }
    api_call += `&num_runs=${num_runs}`;
    console.log(`Requesting ${api_call}`);
    let result = await d3.json(api_call);
    console.log(result);
    return result;
};

const getOrgFromIP = async (ip) => {
    let api_call = `http://${api_server}${rdap_api}?ip=${ip}`;
    console.log(`Requesting ${api_call}`);
    const result = await d3.json(api_call);
    return result;
}

const getMaxBWFromGRNOCIP = async (ip) => {
    // TODO: Better way of telling if it's part of GRNOC
    if (ip.startsWith('198') || ip.startsWith('162') || ip.startsWith('192')) {
        let api_call = `https://snapp-portal.grnoc.iu.edu/tsds-cross-domain/query.cgi?method=query;query=get%20max_bandwidth%20between(now-10m,%20now)%20from%20interface%20where%20interface_address.value%20=%20%22${ip}%22`;
        console.log(`Requesting ${api_call}`);
        const result = await d3.json(api_call);
        return result;
    } else {
        return {'results': []};
    }
}

const getATRChartURL = (ip, start = 1588478400000, end = 1588564799000) => {
    if (ip.startsWith('198') || ip.startsWith('162') || ip.startsWith('192')) {
        return `https://snapp-portal.grnoc.iu.edu/grafana/d-solo/f_KR9xeZk/ip-address-lookup?orgId=2&from=${start}&to=${end}&var-ip_addr=${ip}&panelId=2`;
    }
    return '';
}

// Create "internet graph" using the visible entities.
const createInternetGraph = async (traceroutes, existing = undefined) => {
    let entities = existing;
    if (entities == undefined) {
        entities = new Map();
    }

    for (let trace of traceroutes) {
        let packets = trace.packets;
        for (let i = 0; i < packets.length; i++) {
            // if (!packets[i].hasOwnProperty('ip'))
            if (packets[i].ip == undefined)
                // TODO: Find better way of differentiating between 'unknown'
                packets[i].ip = `hop_${i}_${trace.id.substring(0, 5)}`;
        }
        for (let i = 0; i < packets.length; i++) {
            const packet = packets[i];
            packet.ts = trace.ts;
            const entity_id = `ip(${packet.ip})`;
            let entity = entities.get(entity_id);

            if (!entity) {
                // Calls the API
                const orgResult = await getOrgFromIP(packet.ip);
                const tsdsResult = await getMaxBWFromGRNOCIP(packet.ip);
                let maxBW = undefined;
                if (tsdsResult.results.length > 0) {
                    maxBW = tsdsResult.results[0].max_bandwidth;
                }
                entity = ({
                    id: entity_id,
                    ip: packet.ip,
                    org: orgResult.org,
                    domain: orgResult.domain,
                    max_bandwidth: packet.speed ? packet.speed : maxBW,
                    packets: new Array(),
                    source_ids: new Set(),
                    target_ids: new Set(),
                    lat: packet.lat,
                    lon: packet.lon,
                    // x: packet.x,
                    // y: packet.y,
                    // fx: packet.x,
                    // fy: packet.y
                });
                entities.set(entity_id, entity);
            }

            entity.packets.push(packet);

            // Add the previous packet as a source and next packet as a target.
            if (i > 0)
                entity.source_ids.add(`ip(${packets[i - 1].ip})`);
            if (i < packets.length - 1)
                entity.target_ids.add(`ip(${packets[i + 1].ip})`);
        }
    }

    return entities;
};

// const mergeInternetGraphs = (graph1, graph2) => {
//     // Start with a 'deep' copy of graph 1 (packets memory is not copied)
//     let graph = new Map();
//     for (const [entity_id, entity] of graph1.entries()) {
//         const entity_copy = ({
//             id: entity.id,
//             ip: entity.ip,
//             org: entity.org,
//             packets: Array.from(entity.packets),
//             source_ids: new Set(entity.source_ids),
//             target_ids: new Set(entity.target_ids)
//         });
//         graph.set(entity_id, entity_copy)
//     }
//     // Update with graph 2
//     for (const [entity_id, entity] of graph2.entries()) {
//         if (graph.has(entity_id)) {
//             let existing = graph.get(entity_id);
//             existing.packets = existing.packets.concat(entity.packets);
//             for (let ntt of entity.source_ids) {
//                 existing.source_ids.add(ntt);
//             }
//             for (let ntt of entity.target_ids) {
//                 existing.target_ids.add(ntt);
//             }
//         } else {
//             const entity_copy = ({
//                 id: entity.id,
//                 ip: entity.ip,
//                 org: entity.org,
//                 packets: Array.from(entity.packets),
//                 source_ids: new Set(entity.source_ids),
//                 target_ids: new Set(entity.target_ids)
//             });
//             graph.set(entity_id, entity_copy)
//         }
//     }
//     return graph;
// }

// clusterBy takes a map of entities with an 'id' property and returns a map of new entities that reference
// the input entities as children. Clustering is breadth-first driven by the given label equality, degree,
// and relationship parameters.
// TODO: Remove org clustering for case where it is a single IP - see also updateViz in main.js.
const clusterBy = (entities, getLabel, getRelationships, id_prefix = undefined, max_degree = 1) => {
    const result = new Map();

    // Helper method for cleanliness
    const addToCluster = (cluster_id, entity) => {
        if (!result.has(cluster_id)) {
            // Use ES6 Proxy to recursively access properties of hierarchical clusters (see `handler` def)
            result.set(cluster_id, new Proxy(({id: cluster_id, children: new Map()}), handler));
        }
        // Set the children of the proxy to be the actual entity.
        result.get(cluster_id).children.set(entity.id, entity);
    }

    // // If max_degree is 0, basically return the input
    // if (max_degree == 0) {
    //     for (var [id, entity] of entities) {
    //         addToCluster(id, entity);
    //     }
    // }
    // // If max_degree is Infinity, basically do a 'groupBy'
    // else if (max_degree == Infinity) {
    //     for (var [id, entity] of entities) {
    //         addToCluster(getLabel(entity), entity);
    //     }
    // }
    // // Otherwise, exhaustive search (depth-first) for connected clusters of degree `max_degree`
    // else {

    // Create array of
    const orphan_ids = [...entities.keys()];
    const cluster_count = new Map();

    let i = 0;
    while (i < orphan_ids.length) {
        // Start a new cluster from an unclustered entity
        const orphan = entities.get(orphan_ids[i]);

        // label is the org label - lambda passed by calling function
        const label = getLabel(orphan);

        // Disjoint clusters of the same label are enumerated for distinctness
        if (!cluster_count.has(label))
            cluster_count.set(label, 0);
        cluster_count.set(label, cluster_count.get(label) + 1);

        // cluster_id is the id_prefix + org (label) + cluster count
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
                    // Found a match, add to result
                    addToCluster(cluster_id, candidate);

                    // getRelationships is a lambda that returns a set of the source ids and target ids?
                    const neighbors = Array.from(getRelationships(candidate));

                    // Add neighbors as new search candidates
                    candidates = candidates.concat(neighbors);

                    //TODO add support for max_degree > 1 (recursive neighbors), probably change candidates to a Set a the same time

                    // This entity now belongs to a cluster, so we remove orphans
                    orphan_ids.splice(orphan_ids.indexOf(candidate_id), 1);
                }
            }
        }
    }
    // }
    return result;
};

const propReducer = (property) => {
    let f = null;
    switch (property) {
        case 'source_ids':
        case 'target_ids':
            f = (a, b) => new Set([...a, ...b]);
            break;
        case 'packets':
            f = (a, b) => a.concat(b);
            break;
        // Add in case of lat and lon; then we take average later inside of 'handler'
        case 'lat':
        case 'lon':
            f = (a, b) => a + b;
            break;
        default:
            f = (a, b) => a == b ? a : undefined;
    }
    return f;
}

// If property is not present and the object has an array of child nodes, return an appropriate reduction
// of that property across all children
const handler = ({
    get: (obj, property) => {
        if (property in obj) {
            return obj[property]
        } else if (obj.children) {
            let children = Array.from(obj.children.values());
            let retVal = children.map(child => child[property])
                // propReducer returns the appropriate function for the reduction.
                .reduce((accumulator, value) => propReducer(property)(accumulator, value));

            // Return average value in case of lat or lon - can't be done as part of reduce.
            return (property === 'lat' || property === 'lon') ?
                (retVal / children.length) : retVal;
        }
        return undefined;
    }
})

class Vizualization {
    constructor(root_element, width = 1200, height = 800) {
        this.viz_width = width;
        this.viz_height = height;
        this.node_data = new Map();
        this.node_visual_alias = new Map();
        this.atr_iframes = new Map();
        this.root_element = root_element;

        // Initialize DOM elements
        this.svg = d3.select(root_element).append('svg')
            .attr('width', width)
            .attr('height', height)
            .style('display', 'block')
            .style('margin', 'auto');

        this.tooltip = d3.select(root_element).append('div')
            .attr('id', 'tooltip')
            .classed('tooltip', true)
            .attr('style', 'position: absolute; opacity: 0;');

        this.tooltip_stats = this.tooltip.append('div');

        this.svg.append('svg:defs').selectAll('marker')
            .data(['end'])      // Different link/path types can be defined here
            .enter().append('svg:marker')    // This section adds in the arrows
            .attr('id', String)
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 23)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('svg:path')
            .attr('d', 'M0,-5L10,0L0,5');

        this.link = this.svg.append('g')
            .classed('all_links', true)
            .attr('stroke', '#999')
            .attr('stroke-opacity', 0.6)
            .attr('marker-end', 'url(#end)')
            .selectAll('line');

        this.node = this.svg.append('g')
            .classed('all_nodes', true)
            .attr('stroke', '#fff')
            .attr('stroke-width', 1.5)
            .selectAll('circle');

        // Initialize interactivity
        // TODO: Add position force which pulls to correct x/y after scale.
        this.simulation = d3.forceSimulation()
            // .force('link', d3.forceLink().id())
            // .force('charge', d3.forceManyBody())
            // .force('center', d3.forceCenter(width / 2, height / 2))
            // .force('forceY', d3.forceY(height / 2));

            // Set the position force to be the scaled latitude/longitude (uses getXPos and getYPos).
            .force('collision', d3.forceCollide().radius(d => this.getNodeRadiusPackets(d)))
            .force('forceX', d3.forceX(d => this.getXPos(d)))
            .force('forceY', d3.forceY(d => this.getYPos(d)));


        this.simulation.on('tick', () => {
            this.link
                .attr('x1', d => d.source.x)//{console.log(d); return d.source.x;})
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);
            this.node.attr('transform', d => `translate(${d.x}, ${d.y})`);
        });

        this.maxBW = this.svg.append('g');
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

    getXPos(node) {
        let scale = d3.scaleLinear()
            .domain(d3.extent(this.simulation.nodes().map(d => d.lon)))
            .range([25, this.viz_width - 25]);
        console.log(
            `${node.ip} x = ${scale(node.lon)}\n${node.ip} lon = ${node.lon}`
        );
        return scale(node.lon);
    }

    getYPos(node) {
        let scale = d3.scaleLinear()
            .domain(d3.extent(this.simulation.nodes().map(d => d.lat)))
            .range([this.viz_height - 25, 25]);
        console.log(
            `${node.ip} y = ${scale(node.lat)}\n${node.ip} lat = ${node.lat}`
        );
        return scale(node.lat);
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
        let width = this.viz_width;
        let height = this.viz_height;
        let nodes = this.node;

        let clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

        function dragstarted(d) {
            // Originally 0.3
            if (!d3.event.active) {
                simulation.alphaTarget(0.3).restart();
            }

            // nodes.each(function (node) {
            //         node.fx = node.x;
            //         node.fy = node.y;
            //     }
            // )

            d.fx = d.x;
            d.fy = d.y;
        }

        function dragged(d) {
            d.fx = clamp(d3.event.x, 0, width);
            d.fy = clamp(d3.event.y, 0, height);
        }

        function dragended(d) {
            if (!d3.event.active) {
                simulation.alphaTarget(0).restart();
            }
            d.fx = null;
            d.fy = null;
            // nodes.each(function (node) {
            //         node.fx = null;
            //         node.fy = null;
            //     }
            // )
            //simulation.alpha(1).restart();
        }

        return d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended);
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

    // Creates traffic graph using info scraped through Netbeam API.
    netbeamGraph(trafficInfo, div) {
        let margin = {top: 10, right: 30, bottom: 30, left: 60};

        let oWidth = 600;
        let oHeight = 300;

        let width = oWidth - margin.left - margin.right;
        let height = oHeight - margin.top - margin.bottom;

        let trafficGraph = div.append('svg')
            .attr('width', oWidth)
            .attr('height', oHeight)
            .append('g')
            .attr('transform',

                `translate(${margin.left}, ${margin.top})`
            );

        // Set up scales
        // xScale is time, yScale is bandwidth
        let xScale = d3.scaleLinear()
            .domain(d3.extent([...trafficInfo.keys()]))
            .range([0, width]);
        let xaxis = trafficGraph.append('g')
            .attr('id', 'xaxis')
            .attr('transform',

                `translate(0, ${height})`
            )
            .call(d3.axisBottom(xScale)
                .ticks(10)
                // Use d3 built in tickFormat to make this pretty
                .tickFormat(d => {
                    let date = new Date(d);
                    return `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
                }));

        // Axis label
        xaxis.append('text')
            .classed('axis-label-text', true)
            .attr('transform',

                `translate(${width / 2}, 25)`
            )
            .attr('text-anchor', 'middle')
            .text('time');

        let valsArr = [...trafficInfo.values()];

        let min = d3.min(valsArr.map(d => Math.min(d.in, d.out)));
        let max = d3.max(valsArr.map(d => Math.max(d.in, d.out)));

        let yScale = d3.scaleLinear()
            .domain([min, max])
            .range([height, 0]);
        let yAxis = trafficGraph.append('g')
            .attr('id', 'yaxis')
            .call(d3.axisLeft(yScale)
                .ticks(6)
                .tickFormat(d => d3.format('~s')(d) + 'bps'));

        // Set up legend
        {
            let inLegend = trafficGraph.append('g')
                .attr('id', 'inLegend')
                .attr('transform',

                    `translate(${width - 50}, 10)`
                );
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
                .attr('transform',

                    `translate(30, -5)`
                );
            inLegend.append('circle')
                .attr('cx', 40)
                .attr('cy', -5)
                .attr('fill', 'steelblue')
                .attr('r', 1.5);

            let outLegend = trafficGraph.append('g')
                .attr('id', 'outLegend')
                .attr('transform',

                    `translate(${width - 50}, 20)`
                );
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
                .attr('transform',

                    `translate(30, -5)`
                );
            outLegend.append('circle')
                .attr('cx', 40)
                .attr('cy', -5)
                .attr('fill', 'red')
                .attr('r', 1.5);
        }

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

    // Finds overall max bandwidth to display on vis.
    getOverallMaxBW() {
        let bw = Number.MAX_SAFE_INTEGER;
        let ip = null;
        let nodes = Array.from(this.all_nodes.values()).filter(d => d.id.startsWith('ip'));

        for (let node of nodes) {
            if (node.max_bandwidth && node.max_bandwidth < bw) {
                bw = node.max_bandwidth;
                ip = node.ip;
            }
        }

        this.maxBW.selectAll('text')
            .data([bw, ip])
            .join('text')
            .attr('fill', 'lightgrey')
            .attr('x', 25)
            .attr('y', (_, i) => (i + 1) * 25)
            .text((d, i) => {
                if (d === null || d === Number.MAX_SAFE_INTEGER) {
                    return '';
                }

                if (i === 0) {
                    return `Known Bandwidth Limit: ${d3.format('~s')(d)}bps`;
                } else {
                    return `Limited by node at IP: ${d}`;
                }
            });
    }

    update() {
        this.simulation.stop();

        this.getOverallMaxBW();

        this.vNodes = Array.from(this.node_data.values());

        this.vLinks = new Array();

        let that = this;

        let i = 0;
        while (i < this.vNodes.length) {
            // Handle 'expanded' org vNodes.
            // Update position of the children (as far as simulation is concerned)
            if (this.vNodes[i].expanded && this.vNodes[i].children) {
                for (let child of this.vNodes[i].children.values()) {
                    // Inherit cluster's position in graph to avoid visual chaos
                    // TODO: Update with lat/lon - use scales defined above
                    if (child.x == undefined) {
                        child.x = this.vNodes[i].x;
                        child.y = this.vNodes[i].y;
                        child.vx = this.vNodes[i].vx;
                        child.vy = this.vNodes[i].vy;
                    }
                    this.vNodes.push(child);
                }
                // Remove the parent 'org' vNode.
                this.vNodes.splice(i, 1);
            } else {
                i += 1;
            }
        }

        // Remove preloaded ATR Grafana iFrames
        this.tooltip.selectAll('iframe').remove();

        // Preload ATR Grafana iFrames for rendered IP nodes
        for (let d of this.vNodes) {
            if (d.id.startsWith('ip') && !this.atr_iframes.has(d.id)) {
                const URL = getATRChartURL(d.ip);
                if (URL.length > 0) {
                    const iframe = this.tooltip.append('iframe')
                        .attr('width', 450)
                        .attr('height', 200)
                        .style('display', 'none')
                        .attr('src', getATRChartURL(d.ip));
                    this.atr_iframes.set(d.id, iframe);
                }
            }
        }

        // Add links to vLinks from the source node 'd' to all targets 't'
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

        // Doesn't check for domains that are unknown or undefined - slightly faster to load.
        let unknown = (domain) => domain !== 'unknown' && typeof domain !== 'undefined';

        // Create separate group for each node
        this.node = this.node
            .data(this.vNodes, d => d.id)
            .join('g')
            .classed('single_node', true);

        this.node.selectAll('image').remove();
        this.node.selectAll('circle').remove();

        // Add image (favicon) if we can find it using duckduckgo ico search.
        this.node.append('image')
            .attr('xlink:href', d => unknown(d.domain) ?

                `http://icons.duckduckgo.com/ip2/${d.domain}.ico` : '')
            .attr('draggable', false)
            .attr('width', d => this.getNodeRadiusPackets(d))
            .attr('height', d => this.getNodeRadiusPackets(d))
            .attr('x', d => -1 * this.getNodeRadiusPackets(d) / 2)
            .attr('y', d => -1 * this.getNodeRadiusPackets(d) / 2);

        // Always append circle - this will show if no favicon is retrieved, otherwise opacity = 0 and it's hidden.
        this.node.append('circle')
            .classed('node', true)
            .attr('r', d => this.getNodeRadiusPackets(d) / 2)
            .attr('fill', d => this.getNodeColorOrg(d))
            .attr('opacity', d => unknown(d.domain) ? 0.0 : 1.0)

            // Click to expand nodes
            .on('click', clickHandler)
            // Mouseover previews Grafana/d3 traffic charts
            .on('mouseover', mouseoverHandler)
            .on('mouseout', mouseoutHandler)
            // Doubleclick 'pins' the charts
            .on('dblclick', dblclickHandler)
            .on('mousemove', () => {
                // Updates position of global tooltip.
                this.tooltip.style('left', (d3.event.pageX + 10) + 'px').style('top', (d3.event.pageY + 10) + 'px')
            })
            .call(this._drag());

        this.link = this.link
            .data(this.vLinks)
            .join('line')
            .classed('link', true);

        this.simulation.nodes(this.vNodes);
        // TODO: Check effect of disabling the link forces.
        // this.simulation.force('link', d3.forceLink(this.vLinks).id(d => d.id));
        this.simulation.alpha(1).restart();

        /* ###### Helpers and Handlers ####### */

        // Helper method to get traffic info from Netbeam-polled nodes into acceptable format for secondary d3 vis.
        function generateTrafficInfo(packets) {
            let trafficInfo = new Map();
            for (let packet of packets) {
                if (packet.resource && packet.traffic) {
                    for (let traffic of packet.traffic) {
                        trafficInfo.set(traffic[0], {'ts': traffic[0], 'in': traffic[1], 'out': traffic[2]});
                    }
                }
            }
            return trafficInfo;
        }

        // Generate ToolTipStats. Not complicated, just abstracted b/c it's used more than once.
        function generateTTS(d, packets) {
            return `${d.ip ? d.ip : ''} (${d.org}) | ` +
                `${packets.length} packets | ` +
                `${d.max_bandwidth ? 'Max bandwidth: ' + d3.format('s')(d.max_bandwidth) + 'bps |' : ''} ` +
                `RTT (mean): ${d3.mean(packets, p => p.rtt)}`;
        }

        // Shows the global tooltip on mouseover (if applicable)
        function mouseoverHandler(d) {
            that.tooltip.transition().duration(200).style('opacity', 0.9);

            let packets = d.packets;

            let trafficInfo = generateTrafficInfo(packets);

            that.tooltip_stats.text(generateTTS(d, packets));

            if (d.id.startsWith('ip') && that.atr_iframes.has(d.id)) {
                // Show grafana iframe
                that.atr_iframes.get(d.id).style('display', 'block');
            } else if (d.id.startsWith('ip') && trafficInfo.size > 0) {
                // Show d3 vis of netbeam data
                that.netbeamGraph(trafficInfo, that.tooltip);
            }
        }

        // Hide global tooltip on mouseout (if applicable)
        function mouseoutHandler(d) {
            that.tooltip.transition().duration(200).style('opacity', 0);
            if (d.id.startsWith('ip') && that.atr_iframes.has(d.id)) {
                that.atr_iframes.get(d.id).style('display', 'none');
            }
            that.tooltip.selectAll('svg').remove();
        }

        // Expand nodes on single click (no drag)
        function clickHandler(d) {
            d3.event.preventDefault();
            that.expandNode(d);
            that.update();
        }

        // Pin draggable tooltip on double click (if applicable)
        function dblclickHandler(d) {
            // Make sure that isn't already pinned
            if (d3.select(`
        
                #tooltip$
                    {
                        CSS.escape(d.id)
                    }

            `).node() !== null) return;

            // Create the tooltip div
            let tooltip = d3.select(that.root_element)
                .append('div')
                .attr('id', `
        
                tooltip$
                    {
                        d.id
                    }

            `)
                .classed('tooltip removable', true)
                .attr('style', 'position: absolute; opacity: 0.9;');

            // Append tooltip stats
            tooltip.append('div')
                .append('text')
                .text(generateTTS(d, d.packets));

            // Initial attributes
            let draggable = false;
            let initialX = 0;
            let initialY = 0;
            let updatedX = 0;
            let updatedY = 0;

            // Make draggable on mousedown
            tooltip.on('mousedown', function () {
                d3.event.preventDefault();
                draggable = true;
                initialX = d3.event.clientX;
                initialY = d3.event.clientY;
            });

            // Remove draggable on mouseup
            tooltip.on('mouseup', function () {
                draggable = false;
                initialX = 0;
                initialY = 0;
            });

            // 'Drag' the tooltip if draggable
            tooltip.on('mousemove', function () {
                d3.event.preventDefault();

                if (draggable) {
                    // Calculate updated position
                    updatedX = initialX - d3.event.clientX;
                    updatedY = initialY - d3.event.clientY;
                    initialX = d3.event.clientX;
                    initialY = d3.event.clientY;

                    // Update position
                    let thisElement = d3.select(this).node();
                    thisElement.style.top = (thisElement.offsetTop - updatedY) + 'px';
                    thisElement.style.left = (thisElement.offsetLeft - updatedX) + 'px';
                }
            });

            // Remove on double click
            tooltip.on('dblclick', function () {
                d3.select(this).remove();
            });

            // Start out in default position
            tooltip.style('left', (d3.event.pageX + 10) + 'px')
                .style('top', (d3.event.pageY + 10) + 'px');

            let trafficInfo = generateTrafficInfo(d.packets);

            if (d.id.startsWith('ip') && that.atr_iframes.has(d.id)) {
                // Add iframe for grafana
                tooltip.append('iframe')
                    .attr('width', 450)
                    .attr('height', 200)
                    .attr('src', getATRChartURL(d.ip))
                    .style('display', 'block');
            } else if (d.id.startsWith('ip') && trafficInfo.size > 0) {
                // Add the d3 vis for netbeam info
                that.netbeamGraph(trafficInfo, tooltip);
            } else {
                // If neither data source is applicable, remove the tooltip
                tooltip.remove();
            }
        }
    }
}
