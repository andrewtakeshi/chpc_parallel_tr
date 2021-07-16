class ForceMap {
    constructor(root_element, width = 1200, height = 800, showMap = true) {
        // Common elements
        this.width = width;
        this.height = height;
        this.showMap = showMap;
        this.rootElement = root_element;
        this.svg = d3.select(this.rootElement)
            .append('svg')
            .attr('width', this.width)
            .attr('height', this.height)
            .attr('id', 'mainVisSVG')
            .style('display', 'block')
            .style('margin', 'auto');

        function filterFunc() {
            let event = d3.event;
            return !(event.type === 'dblclick');
        }

        this.zoom = d3.zoom()
            .scaleExtent([1, 20])
            .translateExtent([[-this.width + 150, -this.height + 150], [2 * this.width - 150, 2 * this.width - 150]])
            .filter(filterFunc)
            .on('zoom', this.zoomHandler);

        this.forceG = this.svg.append('g')
            .attr('id', 'forceGroup');
        this.mapG = this.svg.append('g')
            .attr('id', 'mapGroup');

        // Map specific

        this.projection = d3.geoEquirectangular();
        this.path = d3.geoPath().projection(this.projection);
        this.packets = new Map();

        // Force specific

        this.node_data = new Map();
        this.node_visual_alias = new Map();
        this.atr_iframes = new Map();

        this.floating_tooltip = d3.select(root_element).append('div')
            .attr('id', 'forcemap_tooltip')
            .classed('tooltip', true);

        this.tooltip_stats = this.floating_tooltip.append('div');

        this.forceG.append('svg:defs').selectAll('marker')
            .data(['end'])      // Different link/path types can be defined here
            .enter().append('svg:marker')    // This section adds in the arrows
            .attr('id', String)
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 23)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('markerUnits', 'userSpaceOnUse')
            .attr('orient', 'auto')
            .append('svg:path')
            .attr('d', 'M0,-5L10,0L0,5');

        this.all_links = this.forceG.append('g')
            .classed('all_links', true)
            .attr('stroke', '#999')
            .attr('stroke-opacity', 0.6)
            .attr('marker-end', 'url(#end)')
            .attr('stroke-width', 1)
            .selectAll('line');

        this.allNodes = this.forceG.append('g')
            .classed('all_nodes', true)
            .attr('stroke', '#fff')
            .attr('stroke-width', 1.5)
            .selectAll('circle');

        this.toggleMap();
        this.setSimulation();

        this.maxBW = this.svg.append('g');
    }


    /************************************
     *********** Map Section ************
     ************************************/
    setTopography(topojson) {
        this.topojson = topojson;
    }

    zoomHandler() {
        // Map transforms
        d3.select('#mapGroup')
            .selectAll('path')
            .style('stroke-width', 1 / d3.event.transform.k + 'px')
            .attr('transform', d3.event.transform);

        let all_nodes = d3.select('#forceGroup')
            .selectAll('g.single_node');

        // If force nodes exist, perform force transforms
        if (all_nodes.nodes().length > 0) {
            // Select image and circle and perform appropriate transforms
            all_nodes.selectAll('circle')
                .attr('r', d => (d.radius / 2) / d3.event.transform.k);
            all_nodes.selectAll('image')
                .attr('width', d => d.radius / d3.event.transform.k)
                .attr('height', d => d.radius / d3.event.transform.k)
                .attr('x', d => (-1 * d.radius / 2) / d3.event.transform.k)
                .attr('y', d => (-1 * d.radius / 2) / d3.event.transform.k);

            // Transform links
            d3.select('#forceGroup')
                .selectAll('line.link')
                .attr('stroke-width', d => d.packet_count / d3.event.transform.k + 'px');

            // Move the entire force group
            d3.select('#forceGroup')
                .attr('transform', d3.event.transform);
        }
    }

    toggleMap() {
        if (this.showMap) {
            this.zoom.on('zoom', this.zoomHandler);
            this.drawMap();
        } else {
            this.svg.call(this.zoom.transform, d3.zoomIdentity);
            this.zoom.on('zoom', null);
            this.mapG.selectAll('path').remove();
        }
    }


    drawMap() {
        if (!this.topojson) {
            return;
        }

        this.svg.call(this.zoom);

        this.projection = d3.geoEquirectangular()
            .fitSize([this.width, this.height], this.topojson);

        let path = d3.geoPath().projection(this.projection);

        this.mapG.selectAll('path').remove();

        this.mapG.selectAll('path')
            .data(this.topojson.features)
            .join('path')
            .attr('id', d => `${d.id}_map`)
            .classed('outline', true)
            .attr('d', path);
    }

    /************************************
     ********** Force Section ***********
     ************************************/

    setSimulation() {
        if (this.showMap) {
            // Initialize interactivity
            this.simulation = d3.forceSimulation()
                .force('collision', d3.forceCollide()
                    .radius(d => d.radius))
                // .strength(0.1))
                .force('forceX', d3.forceX(d => this.projection([d.lon, d.lat])[0])
                    .strength(1))
                .force('forceY', d3.forceY(d => this.projection([d.lon, d.lat])[1])
                    .strength(1));
        } else {
            this.simulation = d3.forceSimulation()
                .force('link', d3.forceLink().id())
                .force('charge', d3.forceManyBody())
                .force('center', d3.forceCenter(this.width / 2, this.height / 2))
                .force('forceY', d3.forceY(this.height / 2))
                .force('collision', d3.forceCollide()
                    .radius(d => d.radius));
        }

        this.simulation.on('tick', () => {
            this.all_links
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);
            this.allNodes.attr('transform', d => `translate(${d.x}, ${d.y})`);
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
        if (node.expanded) {
            return false;
        }
        node.expanded = true;
        if (node.children) {
            for (var [id, child] of node.children) {
                this.collapseNode(child);
            }
            return true;
        }
        return false;
    }

    getNodeColorOrg(node) {
        const domain = d3.map([...this.node_data.values()], v => v.org).keys();
        const scale = d3.scaleOrdinal(d3.schemeCategory10).domain(domain);
        return scale(node.org);
    }

    /**
     * Converts node_data to a map, id => node.
     * Recursively adds children to the map, if they exist.
     */
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

    nodeDrag() {
        let simulation = this.simulation;
        let width = this.width;
        let height = this.height;

        let clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

        function dragstarted(d) {
            if (!d3.event.active) {
                simulation.alphaTarget(0.3).restart();
            }
            d.fx = d.x;
            d.fy = d.y;
        }

        function dragged(d) {
            d.fx = clamp(d3.event.x, 0, width);
            d.fy = clamp(d3.event.y, 0, height);
        }

        function dragended(d) {
            if (!d3.event.active) {
                simulation.alphaTarget(0);
            }
            d.fx = null;
            d.fy = null;
        }

        return d3.drag()
            // Needed for smooth dragging, along with calling drag from the
            // group (i.e. g.single_node) rather than calling on the circle
            .container(d3.select('#mainVisSVG').node())
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended);
    }

    setData(data) {
        this.node_data = data;

        this.all_nodes_flat = this.flattenNodeData();

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

    /**
     * Creates traffic graph using info scraped through Netbeam API.
     * @param trafficInfo - Traffic info gathered from Netbeam
     * @param div - Root element that the traffic graph is added to.
     */
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
            .attr('transform', `translate(${margin.left}, ${margin.top})`);

        // Set up scales
        // xScale is time, yScale is bandwidth
        let xScale = d3.scaleLinear()
            .domain(d3.extent([...trafficInfo.keys()]))
            .range([0, width]);
        let xaxis = trafficGraph.append('g')
            .attr('id', 'xaxis')
            .attr('transform', `translate(0, ${height})`)
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
            .attr('transform', `translate(${width / 2}, 25)`)
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
        // Select all nodes that are actual nodes (not abstracted org nodes)
        let nodes = Array.from(this.all_nodes_flat.values()).filter(d => d.id.startsWith('ip'));

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

        this.nodeValues = Array.from(this.node_data.values());

        this.vLinks = new Array();

        let that = this;

        let i = 0;
        while (i < this.nodeValues.length) {
            // Handle 'expanded' org vNodes.
            // Update position of the children (as far as simulation is concerned)
            if (this.nodeValues[i].expanded && this.nodeValues[i].children) {
                for (let child of this.nodeValues[i].children.values()) {
                    // Inherit cluster's position in graph to avoid visual chaos
                    if (child.x == undefined) {
                        child.x = this.nodeValues[i].x;
                        child.y = this.nodeValues[i].y;
                        child.vx = this.nodeValues[i].vx;
                        child.vy = this.nodeValues[i].vy;
                    }
                    this.nodeValues.push(child);
                }
                // Remove the parent 'org' vNode.
                this.nodeValues.splice(i, 1);
            } else {
                i += 1;
            }
        }

        // Remove preloaded ATR Grafana iFrames
        this.floating_tooltip.selectAll('iframe').remove();

        let nodeRadiusScale = d3.scaleLinear()
            .domain(d3.extent([...this.node_data.values()], v => v.packets.length))
            .range([16, 24]);

        // Preload ATR Grafana iFrames for rendered IP nodes
        for (let d of this.nodeValues) {
            if (d.id.startsWith('ip') && !this.atr_iframes.has(d.id)) {
                const URL = getATRChartURL(d.ip);
                if (URL.length > 0) {
                    const iframe = this.floating_tooltip.append('iframe')
                        .attr('width', 450)
                        .attr('height', 200)
                        .style('display', 'none')
                        .attr('src', getATRChartURL(d.ip));
                    this.atr_iframes.set(d.id, iframe);
                }
            }

            // Add links to vLinks from the source node 'd' to all targets 't'

            let target_aliases = new Set();
            if (d.target_ids) {
                for (let t of d.target_ids) {
                    target_aliases.add(this.node_visual_alias.get(t));
                }
                for (let t of target_aliases) {
                    if (d.id != t)
                        this.vLinks.push(({
                            source: d,
                            target: this.all_nodes_flat.get(t),
                            packet_count: Math.sqrt(this.all_nodes_flat.get(t).packets.length)
                        }));
                }
            }
            d.radius = nodeRadiusScale(d.packets.length);
        }

        // Doesn't check for domains that are unknown or undefined
        let unknown = (domain) => domain !== 'unknown' && typeof domain !== 'undefined';

        // Create separate group for each node
        this.allNodes = this.allNodes
            .data(this.nodeValues, d => d.id)
            .join('g')
            .classed('single_node', true);

        let zoomNode = this.allNodes.selectAll('circle').node();

        let zoomDenominator = 1;

        if (zoomNode) {
            zoomDenominator = d3.zoomTransform(zoomNode).k;
        }

        this.allNodes.selectAll('image').remove();
        this.allNodes.selectAll('circle').remove();

        // Add image (favicon) if we can find it using duckduckgo ico search.
        this.allNodes.append('image')
            .classed('single_node_img', true)
            .attr('xlink:href', d => unknown(d.domain) ? `http://icons.duckduckgo.com/ip2/${d.domain}.ico` : '')
            .attr('draggable', false)
            .attr('width', d => (d.radius) / zoomDenominator)
            .attr('height', d => (d.radius) / zoomDenominator)
            .attr('x', d => (-1 * d.radius / 2) / zoomDenominator)
            .attr('y', d => (-1 * d.radius / 2) / zoomDenominator);

        // Always append circle - this will show if no favicon is retrieved, otherwise opacity = 0 and it's hidden.
        this.allNodes.append('circle')
            .classed('single_node_circle', true)
            .attr('r', d => (d.radius / 2) / zoomDenominator)
            .attr('fill', d => this.getNodeColorOrg(d))
            .attr('opacity', d => unknown(d.domain) ? 0.0 : 1.0)
            // Doubleclick 'pins' the charts
            .on('dblclick', dblclickHandler)
            // Click to expand nodes
            .on('click', clickHandler)
            // Mouseover previews Grafana/d3 traffic charts
            .on('mouseover', mouseoverHandler)
            .on('mouseout', mouseoutHandler)
            .on('mousemove', () => {
                // Updates position of global tooltip.
                this.floating_tooltip.style('left', (d3.event.pageX + 10) + 'px').style('top', (d3.event.pageY + 10) + 'px')
            });

        d3.selectAll('.single_node')
            .call(this.nodeDrag());

        this.all_links = this.all_links
            .data(this.vLinks)
            .join('line')
            .classed('link', true)
            // .attr('stroke-width', 1 / zoomDenominator);
            .attr('stroke-width', d => d.packet_count / zoomDenominator);

        this.simulation.nodes(this.nodeValues);
        if (!this.showMap) {
            this.simulation.force('link', d3.forceLink(this.vLinks).id(d => d.id));
        }
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
            that.floating_tooltip.transition().duration(200).style('opacity', 0.9);

            let packets = d.packets;

            let trafficInfo = generateTrafficInfo(packets);

            that.tooltip_stats.text(generateTTS(d, packets));

            if (d.id.startsWith('ip') && that.atr_iframes.has(d.id)) {
                // Show grafana iframe
                that.atr_iframes.get(d.id).style('display', 'block');
            } else if (d.id.startsWith('ip') && trafficInfo.size > 0) {
                // Show d3 vis of netbeam data
                that.netbeamGraph(trafficInfo, that.floating_tooltip);
            }
        }

        // Hide global tooltip on mouseout (if applicable)
        function mouseoutHandler(d) {
            that.floating_tooltip.transition().duration(200).style('opacity', 0);
            if (d.id.startsWith('ip') && that.atr_iframes.has(d.id)) {
                that.atr_iframes.get(d.id).style('display', 'none');
            }
            that.floating_tooltip.selectAll('svg').remove();
        }

        // Expand nodes on single click (no drag)
        function clickHandler(d) {
            d3.event.preventDefault();
            if (that.expandNode(d)) {
                that.update();
            }
        }

        // Pin draggable tooltip on double click (if applicable)
        function dblclickHandler(d) {
            d3.event.preventDefault();

            // Make sure that isn't already pinned
            if (d3.select(`#tooltip${CSS.escape(d.id)}`).node() !== null) return;

            // Create the tooltip div
            let tooltip = d3.select(that.rootElement)
                .append('div')
                .attr('id', `tooltip${d.id}`)
                .classed('tooltip removable', true);

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