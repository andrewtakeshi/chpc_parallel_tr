/**
 * Traceroute visualization; uses a map to display hops spatially and a force map to add an element of interactivity +
 * handle collisions between nodes in roughly the same area.
 *
 * @author Paul Fischer, Andrew Golightly, Cameron Davie
 */
class ForceMap {
    /**
     * Constructs a new force map.
     * @param rootElPathOrID Path or ID. Must be selectable by d3. Typically this is just the div where the force map
     * visualization should go.
     * @param isMapShown Boolean which determines if the map should be initially shown or hidden. The force map
     * is configured to use lat/lon to map the nodes to their respective locations if the map is shown, or to place the
     * nodes in a roughly straight line if it is hidden.
     */
    constructor(rootElPathOrID, isMapShown = true) {
        // Common elements
        this.showMap = isMapShown;
        this.rootElPathOrID = rootElPathOrID;
        this.rootElementNode = d3.select(rootElPathOrID).node();
        this.width = this.rootElementNode.clientWidth;
        this.height = 0.5 * this.rootElementNode.clientWidth;
        this.expanded = false;

        // Force specific - see d3-force for more information.
        // nodeProxyMap maps from cluster id's to proxies, i.e. from Org cluster to proxy for all the nodes in the org
        // or from IP (singleton) cluster to proxy for that IP address, as far as I understand it.
        this.nodeProxyMap = new Map();
        this.nodeValues = [];
        this.nodeVisualAlias = new Map();

        // here we map our different bit speed ranges to a range that can be used
        // with d3.interpolateViridis() for an accessible color scale
        this.linkColorScale = d3.scaleQuantile()
            .domain([0, 100000000, 250000000, 500000000, 1000000000, 2000000000, 5000000000, 10000000000, 20000000000,
                40000000000, 80000000000, 100000000000, 400000000000])
            .range(d3.range(0, 1, 0.09)) //set range to 0-1 with 14 buckets for use with d3.interpolateViridis()

        // Global tooltip - this is different from the "pinned" tooltips.
        this.floatingTT = d3.select(rootElPathOrID)
            .append('div')
            .attr('id', 'forcemap_tooltip')
            .classed('tooltip', true);
        this.statsTT = this.floatingTT
            .append('div')
            .attr('id', 'forcemap_tooltip_stats');

        // Need to call setup first so we have the svg to append to
        this.setup();
    }

    /**
     * Function to initialize, or re-initialize a force map.
     */
    setup() {
        // Create our SVG with appropriate width/height.
        this.svg = d3.select(this.rootElPathOrID)
            .append('svg')
            .attr('width', this.width)
            .attr('height', this.height)
            .attr('id', 'mainVisSVG')
            .style('display', 'block')
            .style('margin', 'auto');

        // Set up the zoom function, and assign it to our zoomHandler.
        this.zoom = d3.zoom()
            .scaleExtent([1, 10])
            .translateExtent([[-this.width + 150, -this.height + 150], [2 * this.width - 150, 2 * this.width - 150]])
            // We use double click for something else, so we override the zoom behaviour for this event.
            .filter(() => !(d3.event.type === 'dblclick'))
            .on('zoom', this.zoomHandler);

        // All d3-force related things go to forceG.
        this.forceG = this.svg.append('g')
            .attr('id', 'forceGroup');

        // All d3-geo (map) related things go to mapG
        this.mapG = this.svg.append('g')
            .attr('id', 'mapGroup');

        // Max bandwidth group overlay on top of the map/force vis.
        this.maxBW = this.svg.append('g');

        // TODO: Remove attributes from here - should be applied directly to links or done in CSS.
        // Create group for all the links
        this.allLinks = this.forceG.append('g')
            .classed('all_links', true)
            .attr('stroke', '#999')
            .attr('stroke-opacity', 1)
            .attr('stroke-width', 1)
            .selectAll('line');

        // Create group for all the nodes
        this.allNodes = this.forceG.append('g')
            .classed('all_nodes', true)
            .attr('stroke', '#fff')
            .attr('stroke-width', 1.5)
            .selectAll('circle');

        // Add link legend
        // Append a group for the legend
        this.linkLegend = this.svg
            .append('g')
            .attr('id', 'linkLegend')
            .attr('width', 200)
            .attr('height', this.height / 2)
            .attr('transform', `translate(${this.width - 20}, 8)`);

        // Append colored rects to delineate boundaries
        this.linkLegend.selectAll('rect')
            .data(this.linkColorScale.range())
            .join('rect')
            .attr('width', '20px')
            .attr('height', (this.height / 2) / 12)
            .attr('stroke', d => d)
            .attr('stroke-width', '1px')
            .attr('fill', d => d3.interpolateViridis(d))
            .attr('x', 0)
            .attr('y', (_, i) => (this.height / 2) / 12 * (11 - i));

        // Append text to describe boundaries
        this.linkLegend.selectAll('text')
            .data(this.linkColorScale.domain())
            .join('text')
            .classed('link-legend-text', true)
            .attr('text-anchor', 'end')
            .attr('x', -5)
            .attr('y', (_, i) => (this.height / 2) / 12 * (12 - i) + 4)
            .text(d => d3.format('~s')(d) + 'bps');

        // Sets the desired force behavior depending on the value of this.showMap.
        this.setSimulation();
        // Disables or enables the map, depending on the value of this.showMap.
        this.toggleMap(this.showMap);

        // We call update directly so that we don't "collapse" any nodes
        this.update();
    }

    /**
     * Handles resize. Makes the map scalable with the window.
     * @param width
     * @param height
     */
    resize(width, height) {
        // Adjust width and height
        this.width = width;
        this.height = height;

        // Remove the old visualization, and setup a new one.
        d3.select(this.rootElPathOrID).select('#mainVisSVG').remove();
        this.setup();

        if (this.showMap) {
            // Manually set the node positions to where the map projection says they should be.
            let nodes = this.simulation.nodes();
            nodes.forEach(d => {
                d.fx = this.projection([d.lon, d.lat])[0];
                d.fy = this.projection([d.lon, d.lat])[1];
            });
            this.simulation.stop();
            nodes.forEach(d => {
                d.fx = null;
                d.fy = null;
            });
        } else {
            // TODO: Manual placement in network view.
        }
        this.simulation.alpha(1).restart();
    }

    /************************************
     *********** Map Section ************
     ************************************/

    /**
     * Sets the topography - used for changing what map is shown.
     * @param geojson - Filtered and processed geojson.
     */
    setTopography(geojson) {
        this.geojson = geojson;
    }

    /**
     * get the current zoom level
     */
    getCurrentZoom() {
        let zoomOutline = this.mapG.selectAll('path').node();
        return zoomOutline ? d3.zoomTransform(zoomOutline).k : 1;
    }

    /**
     * Handler for zoom in button click.
     * @returns d3 zoom object, representing the new zoom level.
     */
    zoomIn() {
        let newZoom = this.getNewZoomLevel(true);
        this.zoom.scaleTo(this.svg, newZoom);
        return newZoom;
    }

    /**
     * Handler for zoom out button click.
     * @returns d3 zoom object, representing the new zoom level.
     */
    zoomOut() {
        let newZoom = this.getNewZoomLevel(false);
        this.zoom.scaleTo(this.svg, newZoom);
        return newZoom;
    }

    /**
     * Performs a zoom transformation to zoom in or out.
     * @param isZoomIn - Determines whether new zoom is a zoom in (true) or zoom out (false).
     * @returns d3 zoom object, representing the new zoom level clamped to the current scale extent.
     */
    getNewZoomLevel(isZoomIn = false) {
        let oldZoom = this.getCurrentZoom();
        let scaleExtent = this.zoom.scaleExtent();
        let zoomInc = 1.5;

        let newZoom = isZoomIn ? zoomInc * oldZoom : (1 / zoomInc) * oldZoom;

        return this.clamp(newZoom, scaleExtent[0], scaleExtent[1]);
    }

    /**
     * Defines zoom behavior.
     */
    zoomHandler() {
        // Map transforms
        d3.select('#mapGroup')
            .selectAll('path')
            .style('stroke-width', 1 / d3.event.transform.k + 'px')
            .attr('transform', d3.event.transform);

        let allNodes = d3.select('#forceGroup')
            .selectAll('g.single_node');

        // If force nodes exist, perform force transforms
        if (allNodes.nodes().length > 0) {
            // Select image and circle and perform appropriate transforms
            allNodes.selectAll('.single_node_circle')
                .attr('r', d => d.radius / d3.event.transform.k)
                .attr('stroke-width', 1 / d3.event.transform.k);
            allNodes.selectAll('.single_node_expandable')
                .attr('r', d => d.radius / d3.event.transform.k)
                .attr('stroke-width', 2 / d3.event.transform.k);
            allNodes.selectAll('.single_node_img')
                .attr('width', d => d.diameter / d3.event.transform.k)
                .attr('height', d => d.diameter / d3.event.transform.k)
                .attr('x', d => (-d.radius) / d3.event.transform.k)
                .attr('y', d => (-d.radius) / d3.event.transform.k);

            // No link transformation needed because of 'vector-effect : non-scaling-stroke' in CSS.
            // Move the entire force group
            d3.select('#forceGroup')
                .attr('transform', d3.event.transform);
        }
    }

    /**
     * Clamp v within lo, hi boundaries
     * Used for clamping zoom level
     */
    clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
    }

    /**
     * Hide or show the map, depending on the value of this.showMap.
     * @param forceDisplay - by default this is undefined. If it is undefined, the function toggles the value
     * of this.showMap. If forceDisplay is defined (bool) then this.showMap is set to the value of forceDisplay.
     */
    toggleMap(forceDisplay = undefined) {
        if (forceDisplay !== undefined) {
            this.showMap = Boolean(forceDisplay);
        } else {
            this.showMap = !this.showMap;
        }

        if (this.showMap) {
            // Draw the map, enable and reset zoom.
            this.zoom.on('zoom', this.zoomHandler);
            this.svg.call(this.zoom.transform, d3.zoomIdentity);
            this.drawMap();

            // Also reset all nodes that have been moved and "stuck" as part of network view.
            for (let node of this.nodeValues)
            {
                node.fx = null;
                node.fy = null;
            }
        } else {
            // Reset zoom, disable it, and then remove the map.
            this.svg.call(this.zoom.transform, d3.zoomIdentity);
            this.zoom.on('zoom', null);
            this.mapG.selectAll('path').remove();
        }
    }

    /**
     * Draws the map.
     */
    drawMap() {
        // Don't do anything if the geojson isn't present or map should be hidden.
        if (!this.geojson || !this.showMap) {
            return;
        }

        // Set up the projection and path.
        this.projection = d3.geoEquirectangular()
            .fitSize([this.width, this.height], this.geojson);

        let path = d3.geoPath().projection(this.projection);

        // Remove any existing map - we want to redraw entirely instead of joining
        // because the different geojson files can have conflicting IDs.
        this.mapG.selectAll('path').remove();

        // Actually draw the map
        this.mapG.selectAll('path')
            .data(this.geojson.features)
            .join('path')
            .attr('id', d => `${d.id}_map`)
            .classed('outline', true)
            .attr('d', path);

        // Reset zoom when we draw/redraw the map.
        this.svg.call(this.zoom).call(this.zoom.transform, d3.zoomIdentity);

        // // We call update directly so that we don't "collapse" any nodes
        // this.update();
    }

    /************************************
     ********** Force Section ***********
     ************************************/

    /**
     * Set the simulation depending on the value of this.drawMap.
     * if drawMap:
     *      Simulation maps nodes to lat/lon
     * else:
     *      Simulation uses default ordering, with forces centering the vis on the center of the SVG + a forceY to get
     *      the nodes to appear in a relatively straight line.
     */
    setSimulation() {
        if (this.showMap) {
            // Initialize interactivity
            this.simulation = d3.forceSimulation()
                .force('collision', d3.forceCollide()
                    .radius(d => 0.6 * d.diameter))
                .force('forceX', d3.forceX(d => this.projection([d.lon, d.lat])[0])
                    .strength(1))
                .force('forceY', d3.forceY(d => this.projection([d.lon, d.lat])[1])
                    .strength(1));
        } else {
            let denominator = () => {
                return d3.max(d3.selectAll('g.single_node').nodes(), d => d.__data__.ttl);
            }

            let that = this;

            this.simulation = d3.forceSimulation()
                .force('link', d3.forceLink()
                    .strength(0.5)
                    .id())
                .force('charge', d3.forceManyBody()
                    .distanceMax(100))
                // .force('center', d3.forceCenter(this.width / 2, this.height / 2))
                // .force('forceX', d3.forceX(d => (d.ttl * ((that.width - 100) / denominator())) + 15))
                .force('forceX', d3.forceX(d => (d.ttl - 1) * ((that.width - 100) / denominator())))
                .force('forceY', d3.forceY(that.height / 2)
                    .strength(0.3))
                .force('collision', d3.forceCollide()
                    .radius(d => d.diameter));
        }

        // Common to both simulations; updates the link and node positions on every tick of the simulation.
        this.simulation.on('tick', () => {
            this.allLinks
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);
            this.allNodes.attr('transform', d => `translate(${d.x}, ${d.y})`);
        });
    }

    /**
     * Recursively collapses the children of node. Allows for expanding the children of expanded nodes?
     * I'm not entirely sure, as this is part of Paul's work.
     * @param node The node to "collapse".
     */
    collapseNode(node) {
        const _collapse = (child) => {
            child.expanded = true;
            this.nodeVisualAlias.set(child.id, node.id)
            if (child.children) {
                for (var [id, child] of child.children) {
                    _collapse(child);
                }
            }
        };
        _collapse(node);
    }

    /**
     * Expand a node (i.e. go from org node to multiple IP nodes).
     * @param node The node to expand.
     * @returns {boolean} Returns true if the node was expanded and had children. Returns false if the node was already
     * expanded or the node didn't have any children that could be expanded.
     */
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

    /**
     * Used to color nodes that a favicon doesn't exist for.
     * @param node Node to assign a color to.
     * @returns Color according to d3.scaleOrdinal.
     */
    getNodeColorOrg(node) {
        const domain = d3.map([...this.nodeProxyMap.values()], v => v.org).keys();
        const scale = d3.scaleOrdinal(d3.schemeCategory10).domain(domain);
        return scale(node.org);
    }

    /**
     * Converts node_data to a map, id => node.
     * Recursively adds children to the map, if they exist.
     */
    flattenNodeData() {
        let flatData = new Map();
        const _flatten = (child) => {
            flatData.set(child.id, child)
            if (child.children) {
                for (var [id, child] of child.children) {
                    _flatten(child);
                }
            }
        };
        for (let [id, entity] of this.nodeProxyMap) {
            _flatten(entity)
        }
        return flatData;
    }

    /**
     * Force simulation drag handler.
     * @returns An instance of d3.drag with all the proper handlers set up.
     */
    nodeDrag() {

        let simulation = this.simulation;
        let width = this.width;
        let height = this.height;
        let that = this;

        function dragstarted(d) {
            if (!d3.event.active) {
                simulation.alphaTarget(0.3).restart();
            }
            // Bring the dragged node to the top. Small ease of use thing. Less important because the force between
            // nodes should prevent any overlaps, but it's still nice to have.
            d3.select(this).raise();
            d.fx = d.x;
            d.fy = d.y;
        }

        function dragged(d) {
            d.fx = that.clamp(d3.event.x, 0, width);
            d.fy = that.clamp(d3.event.y, 0, height);
        }

        function dragended(d) {
            if (!d3.event.active) {
                simulation.alphaTarget(0);
            }

            // Keep fixed position in network view, but reset back to force in map view.
            if (that.showMap) {
                d.fx = null;
                d.fy = null;
            }
        }

        return d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended);
    }

    /**
     * Set/update data for visualization. Calls update after data has been updated.
     * This is another one of the functions I'm not super sure about as it's part of Paul's work.
     * @param data: Data to set.
     */
    setData(data) {
        if (data === undefined || data === null) {
            return;
        }

        this.unclusteredData = data;
        this.nodeProxyMap = this.clusterBy(data,
            (d) => d.org,
            (d) => new Set([...d.source_ids, ...d.target_ids]),
            "Org");
        this.allNodesFlat = this.flattenNodeData();

        for (var [k, v] of this.nodeProxyMap) {
            v.expanded = false;
            this.nodeVisualAlias.set(k, k);
            if (v.children) {
                for (var [kk, vv] of v.children) {
                    vv.expanded = false;
                    this.nodeVisualAlias.set(kk, k);
                }
            }
        }

        this.update();
    }

    /**
     * Creates traffic graph using info scraped through auxiliary API.
     * @param trafficInfo - Traffic info gathered from auxiliary API
     * @param div - d3 selection corresponding to the root element to draw the graph on.
     * @param checks - Boolean which determines if the checkboxes controlling the additional information (i.e. discards,
     * errors, and unicast packets) should be added. By default, this is false, and should only be set to true for the
     * pinned tooltips.
     */
    auxGraph(trafficInfo, div, checks = false) {
        // 200px margin on right side of graph to allow for legend / metric checkboxes
        let margin = {top: 30, right: 200, bottom: 30, left: 60};

        // Initially, trafficInfo has both the actual data and all of the available keys includeded in the data.
        // We separate the two here.
        let trafficKeys = trafficInfo.keys;
        trafficInfo = trafficInfo.info;

        // Check to make sure there's actually data to display.
        if (trafficKeys.length === 0 || Object.keys(trafficInfo).length === 0) {
            return;
        }

        // o* is the overall or outer width/height.
        let oWidth = 800;
        let oHeight = 400;

        // i* is the inner width/height - i.e. o* - margins.
        let iWidth = oWidth - margin.left - margin.right;
        let iHeight = oHeight - margin.top - margin.bottom;

        // Prevents "double" graph from appearing.
        // Used to happen when the nodeMouseClick handler was called. It would move the node slightly which would
        // trigger the event again and lead to two (or more) graphs being appended to the div.
        if (div.selectAll('svg').nodes().length > 0) {
            return;
        }

        // Append a new SVG for the traffic graph.
        let trafficGraph = div.append('svg')
            .attr('width', oWidth)
            .attr('height', oHeight)
            .append('g')
            .attr('transform', `translate(${margin.left}, ${margin.top})`);

        // timestamps used for setting up x axis.
        let timestamps = Object.keys(trafficInfo).map(d => parseInt(d));

        // array of objects; each object should at least have the keys ts (timestamp), traffic_in, and traffic_out. other
        // keys may be available depending on the data source and timestamp (i.e. stardust only sends certain metrics at
        // 5 minute intervals).
        let allValArr = Object.values(trafficInfo);

        // Ah, Perry the Platypus! It seems you've met my Underscorinator!
        // Makes strings lowercase and converts whitespace to underscores.
        let underscorinator = d => d.replace(/\s/g, '_').toLowerCase(); // DOOFENSHMIRTZ!!!

        // underscorinator but it strips the last value (i.e. no 'in' or 'out')
        // Used to generate keys for the y scales.
        let yKeyinator = (inStr, sep) => {
            let inputSplit = inStr.split(sep);
            let ret = inputSplit[0].toLowerCase();
            for (let i = 1; i < inputSplit.length - 1; i++) {
                ret += `_${inputSplit[i].toLowerCase()}`;
            }
            return ret;
        }

        let types = trafficKeys.map(d => d.replace(/_/g, ' ').toLowerCase());

        // typesSet is used for setting up the different y scale values.
        let typesSet = new Set(types.map(d => yKeyinator(d, ' ')));

        // Measurement is just the first word, i.e. "traffic" or "errors"
        // measurementFilter is used to get all the values of a specific type of measurement
        // this in turn is used to create the extent for the scales
        let measurementFilter = (valArr, measurement) => {
            let retArr = []
            for (let val of valArr) {
                let valKeys = Object.keys(val)
                if (valKeys.includes(`${measurement}_in`) || valKeys.includes(`${measurement}_packets_in`)) {
                    let iomeasures = valKeys.filter(d => d.startsWith(measurement));
                    for (let title of iomeasures) {
                        retArr.push(val[title]);
                    }
                }
            }
            return retArr;
        }

        // Set up scales
        // xScale is time
        let xScale = d3.scaleLinear()
            .domain(d3.extent(timestamps))
            .range([0, iWidth]);
        let xAxis = trafficGraph.append('g')
            .attr('id', `x_axis_${div.attr('id')}`)
            .attr('transform', `translate(0, ${iHeight})`)
            .call(d3.axisBottom(xScale)
                .ticks(10)
                // Use d3 built in tickFormat to make this pretty
                .tickFormat(d => {
                    let date = new Date(d);
                    return `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
                }));

        // Axis label
        xAxis.append('text')
            .classed('axis-label-text', true)
            .attr('transform', `translate(${iWidth / 2}, 25)`)
            .attr('text-anchor', 'middle')
            .text('time');

        // Set up yScales - we want a separate scale for each of the measurements b/c using a single scale for
        // everything hides things like the packets in/out.
        let yScales = {};
        for (let measurement of typesSet) {
            yScales[measurement] = d3.scaleLinear()
                // Use the max of 1 & measurement result to ensure that there is some difference for all measurements, i.e.
                // discards are usually 0 but they should show up on the bottom
                .domain([0, d3.max([1, d3.max(measurementFilter(allValArr, measurement))])])
                // .domain(d3.extent(measurementFilter(allValArr, measurement)))
                .range([iHeight, 0]);
        }

        // Create a new group
        let yAxis = trafficGraph.append('g')
            .attr('id', `y_axis_${div.attr('id')}`);
        yAxis.call(d3.axisLeft(yScales['traffic'])
            .ticks(6)
            .tickFormat(d => d3.format('~s')(d) + 'bps'));

        /**
         * Appends appropriate elements to create the line graph for measurement.
         * @param measurement - Key corresponding to the measurement; i.e. for traffic_in, the measurement would be
         * traffic_in. trafficKeys contains all the available measurements for each node.
         */
        let generateLineGraph = (measurement) => {
            if (d3.select(`#${measurement}_line_${div.attr('id')}`).node() !== null) {
                d3.select(`#${measurement}_line_${div.attr('id')}`).remove();
                d3.select(`#${measurement}_circs_${div.attr('id')}`).remove();
                return;
            }

            let measureKey = yKeyinator(measurement, '_');

            // should be everything except for the first/last
            let selectedYScale = yScales[measureKey];

            trafficGraph.append('path')
                .attr('id', `${measurement}_line_${div.attr('id')}`)
                .datum(allValArr.filter(d => `${measurement}` in d))
                .classed('aux_metrics', true)
                .classed(`aux_${measureKey}`, true)
                .classed('aux_out', measurement.includes("out"))
                .attr('fill', 'none')
                .attr('d', d3.line()
                    .x(d => xScale(d.ts))
                    .y(d => selectedYScale(d[measurement]))
                    .curve(d3.curveMonotoneX)
                );

            trafficGraph.append('g')
                .attr('id', `${measurement}_circs_${div.attr('id')}`)
                .selectAll('circle')
                .data(allValArr.filter(d => `${measurement}` in d))
                .join('circle')
                .attr('r', 2)
                .attr('cx', d => xScale(d.ts))
                .attr('cy', d => selectedYScale(d[measurement]))
                .on('mouseover', d => {
                    d3.select("#forcemap_tooltip").raise();
                    d3.select("#forcemap_tooltip").style('opacity', 0.9);
                    d3.select("#forcemap_tooltip_stats").text((measurement.includes("traffic") ? d3.format('~s')(d[measurement]) + 'bps' : d[measurement]));
                })
                .on('mouseout', () => {
                    d3.select("#forcemap_tooltip").style('opacity', 0);
                    d3.select("#forcemap_tooltip_stats").text("");
                })
                .on('mousemove', () => {
                    // Updates position of global tooltip.
                    d3.select("#forcemap_tooltip").style('left', (d3.event.pageX + 10) + 'px').style('top', (d3.event.pageY + 10) + 'px')
                });
        }

        // Checks is true when the tooltip is pinned, meaning that we want to show the metric checkboxes allowing the
        // user to select metrics. Otherwise we will just show a simple legend.
        if (checks) {
            let metricList = div.append('div')
                .style('position', 'absolute')
                .style('top', `${margin.top}px`)
                .style('right', '20px')
                .classed('checkbox-area', true)
                .attr('width', `${margin.right - 20}px`)
                .attr('height', `${iHeight}px`);

            if (metricList.selectAll('ul').nodes().length === 0) {
                metricList.append('ul');
            }

            // Bind data to the list items
            metricList.selectAll('ul')
                .selectAll('li')
                .data(types)
                .join('li')
                .style('list-style-type', 'none');

            let checkboxes = div.selectAll('div.checkbox-area')
                .selectAll('ul')
                .selectAll('li');

            checkboxes.append('input')
                .attr('id', d => `checkbox_${underscorinator(d)}_${div.attr('id')}`)
                .attr('value', d => d)
                .attr('type', 'checkbox')
                .classed('form-check-input', true)
                .on('click', function (d) {
                    d3.event.stopPropagation();
                    generateLineGraph(underscorinator(d));
                })
                // Prevent dblclick on checkbox from hiding the tooltip.
                .on('dblclick', _ => d3.event.stopPropagation());

            checkboxes.selectAll('input')
                .filter(d => d === 'traffic in' || d === 'traffic out')
                .property('checked', true);

            checkboxes.append('label')
                .attr('for', d => `checkbox_${underscorinator(d)}_${div.attr('id')}`)
                .attr('class', d => `aux_${yKeyinator(d, ' ')} aux_metrics`)
                .classed('aux_out', d => d.toLowerCase().includes('out'))
                .text(d => d);

            let yScaleRow = div.append('div')
                .classed('row', true)
                .append('div')
                .classed('col', true)
                .classed('d-flex justify-content-center', true);

            yScaleRow.append('label')
                .attr('for', `y_axis_select_${div.attr('id')}`)
                .text('y axis: ')
                .attr('style', 'margin-bottom: 0rem');

            let yScaleSelect = yScaleRow.append('select')
                .attr('id', `y_axis_select_${div.attr('id')}`)
                .attr('style', 'width: auto');

            yScaleSelect.selectAll('option')
                .data([...typesSet])
                .join('option')
                .attr('value', d => d)
                .text(d => d.replace('_', ' '));

            yScaleSelect.selectAll('option')
                .filter(d => d === 'traffic')
                .attr('selected', true);

            yScaleSelect.on('change', _ => {
                let key = d3.event.target.value;
                if (key === 'traffic') {
                    yAxis.call(d3.axisLeft(yScales[key])
                        .ticks(6)
                        .tickFormat(d => d3.format('~s')(d) + 'bps'));
                } else {
                    yAxis.call(d3.axisLeft(yScales[key]));
                }
                // Uncomment to make boxes get checked when scale changes
                // let _in = d3.select(`#checkbox_${key}_in_${div.attr('id')}`);
                // let _out = d3.select(`#checkbox_${key}_out_${div.attr('id')}`);
                //
                // if (!_in.property('checked')) {
                //     _in.node().click();
                // }
                // if (!_out.property('checked')) {
                //     _out.node().click();
                // }
            });
        } else {
            // in this case, the tooltip is not pinned, so we are just displaying a simple in/out traffic legend
            let inLegend = trafficGraph.append('g')
                .attr('id', 'inLegend')
                .attr('transform', `translate(${iWidth}, 10)`);
            inLegend.append('text')
                .attr('style', 'font: 12px sans-serif;')
                .text('in:');
            inLegend.append('line')
                .attr('x1', 0)
                .attr('x2', 40)
                .attr('y1', 0)
                .attr('y2', 0)
                .classed('aux_traffic', true)
                .classed('aux_metrics', true)
                .attr('transform', `translate(30, -5)`);
            inLegend.append('circle')
                .attr('cx', 50)
                .attr('cy', -5)
                .attr('r', 1.5);

            let outLegend = trafficGraph.append('g')
                .attr('id', 'outLegend')
                .attr('transform', `translate(${iWidth}, 20)`);
            outLegend.append('text')
                .attr('style', 'font: 12px sans-serif;')
                .text('out:');
            outLegend.append('line')
                .attr('x1', 0)
                .attr('x2', 40)
                .attr('y1', 0)
                .attr('y2', 0)
                .classed('aux_traffic', true)
                .classed('aux_metrics', true)
                .classed('aux_out', true)
                .attr('transform', `translate(30, -5)`);
            outLegend.append('circle')
                .attr('cx', 50)
                .attr('cy', -5)
                .attr('r', 1.5);
        }
        generateLineGraph('traffic_in');
        generateLineGraph('traffic_out');
    }

    /**
     * Finds overall max bandwidth to display on the graph.
     */
    getOverallMaxBW() {
        let minBW = Number.MAX_SAFE_INTEGER;
        let ip = null;

        if (!this.allNodesFlat) {
            return;
        }

        // Select all nodes that are actual nodes (not abstracted org nodes)
        let nodes = Array.from(this.allNodesFlat.values()).filter(d => d.id.startsWith('ip'));

        // loop through nodes to find the node with min bw and its ip
        for (let node of nodes) {
            if (node.max_bandwidth && node.max_bandwidth < minBW) {
                minBW = node.max_bandwidth;
                ip = node.ip;
            }
        }

        this.maxBW.selectAll('text')
            .data([minBW, ip])
            .join('text')
            .attr('fill', 'black')
            .attr('x', 25)
            .attr('y', (_, i) => (i + 1) * 25)
            .text((d, i) => {
                if (d === null || d === Number.MAX_SAFE_INTEGER) {
                    return '';
                }

                if (i === 0) {
                    return `Bandwidth Limit for Known Portion of Path: ${d3.format('~s')(d)}bps`;
                } else {
                    return `Limited by node at IP: ${d}`;
                }
            });
    }

    /**
     * Updates the visualization.
     * Contains all the handlers as well, although they could likely be moved outside of this function.
     */
    update() {
        this.simulation.stop();

        this.setSimulation();

        // Appends maxBW to the vis.
        this.getOverallMaxBW();

        this.nodeValues = Array.from(this.nodeProxyMap.values());

        this.vLinks = [];

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

        // Set up scale for nodes diameters.
        let nodeDiameterScale = d3.scaleLinear()
            .domain(d3.extent([...this.nodeProxyMap.values()], v => v.packets.length))
            .range([16, 24]);

        let packetScaleDomain = [];

        // Generate links
        for (let d of this.nodeValues) {
            // Add links to vLinks from the source node 'd' to all targets 't'
            let targetAliases = new Set();
            if (d.target_ids) {
                for (let t of d.target_ids) {
                    // node_visual_alias contains mapping from ip=>cluster and cluster=>ip
                    targetAliases.add(this.nodeVisualAlias.get(t));
                }
                for (let t of targetAliases) {
                    if (d.id !== t) {
                        let target = this.allNodesFlat.get(t);
                        let d_mbw = d.max_bandwidth ? d.max_bandwidth : 0;
                        let t_mbw = target.max_bandwidth ? target.max_bandwidth : 0;
                        let unknown_bw = !(d.max_bandwidth && target.max_bandwidth);
                        packetScaleDomain.push(target.packets.length);
                        this.vLinks.push(({
                            source: d,
                            target: target,
                            // TODO: Tweak value of packetScale to make links more visible + easier to hover over.
                            // Used to determine the width of the line.
                            packet_scale: Math.sqrt(target.packets.length),
                            packet_count: target.packets.length, //
                            // Used to determine line color + append info on hover.
                            max_bandwidth: Math.min(d_mbw, t_mbw),
                            unknown_bw: unknown_bw
                        }));
                    }
                }
            }

            // Add diameter and radius properties to every node.
            d.diameter = nodeDiameterScale(d.packets.length);
            d.radius = d.diameter / 2;
        }
        // set the bounds on the size of a path in the viz (based on packet count)
        let packetScale = d3.scaleLinear().domain(d3.extent(packetScaleDomain)).range([3, 7]);

        // Lambda to check for unknown or undefined domains - returns true if domain is known, false otherwise.
        let known = (domain) => domain !== null && domain !== 'unknown' && typeof domain !== 'undefined';

        // Create separate group for each node
        this.allNodes = this.allNodes
            .data(this.nodeValues, d => d.id)
            .join('g')
            .classed('single_node', true);

        let zoomOutline = this.mapG.selectAll('path').node();
        let zoomDenominator = zoomOutline ? d3.zoomTransform(zoomOutline).k : 1;

        // TODO: Modify this to be a join. This will have to use the node id or something similar, as the default value
        //  (index?) doesn't work correctly (i.e. nodes get overridden and theres a chance for missing data).

        // Remove all images and circles (nodes) so we have a clean update.
        this.allNodes.selectAll('image').remove();
        this.allNodes.selectAll('circle').remove();

        // Add image (favicon) if we can find it using duckduckgo ico search.
        this.allNodes.append('image')
            .classed('single_node_img', true)
            .attr('xlink:href', d => known(d.domain) ? `http://icons.duckduckgo.com/ip2/${d.domain}.ico` : '')
            .attr('draggable', false)
            .attr('width', d => (d.diameter) / zoomDenominator)
            .attr('height', d => (d.diameter) / zoomDenominator)
            .attr('x', d => (-d.radius) / zoomDenominator)
            .attr('y', d => (-d.radius) / zoomDenominator);

        // Always append circle - this will show if no favicon is retrieved, otherwise opacity = 0 and it's hidden.
        this.allNodes.append('circle')
            .classed('single_node_circle', true)
            .attr('r', d => (d.diameter) / zoomDenominator / 2)
            .attr('stroke', d => this.getNodeColorOrg(d))
            // .attr('stroke', d => d.expanded ? 'black': 'red')
            .attr('stroke-width', 1 / zoomDenominator)
            .attr('fill', d => this.getNodeColorOrg(d))
            .attr('opacity', d => known(d.domain) ? 0.0 : 1.0);

        // Acts as an outline around each node. Colored skyblue if the node can be expanded. No outline if the node is
        // already expanded.
        this.allNodes.append('circle')
            .classed('single_node_expandable', true)
            .attr('r', d => ((d.diameter + 2) / zoomDenominator / 2))
            .attr('stroke', d => d.expanded ? 'none' : 'skyblue')
            .attr('stroke-width', 2 / zoomDenominator)
            .attr('fill', 'none');

        this.allNodes
            // Doubleclick 'pins' the charts
            .on('dblclick', nodeDblClickHandler)
            // Click to expand nodes
            .on('click', nodeClickHandler)
            // Mouseover previews Grafana/d3 traffic charts
            .on('mouseover', nodeMouseoverHandler)
            .on('mouseout', nodeMouseoutHandler)
            .on('mousemove', () => {
                // Updates position of global tooltip.
                this.floatingTT.style('left', (d3.event.pageX + 10) + 'px').style('top', (d3.event.pageY + 10) + 'px')
            });

        // Drag is called on the group to prevent jittering.
        d3.selectAll('.single_node')
            .call(this.nodeDrag());

        // begin todo: attempt to make nodes appear in right place
        // let all_nodes = d3.select('#forceGroup')
        //     .selectAll('g.single_node');
        //// If force nodes exist, perform force transforms
        // if (this.allNodes.nodes().length > 0) {
        //     // Select image and circle and perform appropriate transforms
        //     this.allNodes.selectAll('circle')
        //         .attr('r', d => d.radius / d3.event.transform.k)
        //         .attr('stroke-width', 1 / d3.event.transform.k);
        //     this.allNodes.selectAll('image')
        //         .attr('width', d => d.diameter / d3.event.transform.k)
        //         .attr('height', d => d.diameter / d3.event.transform.k)
        //         .attr('x', d => (-d.radius) / d3.event.transform.k)
        //         .attr('y', d => (-d.radius) / d3.event.transform.k);
        //
        //     // No link transformation needed because of 'vector-effect : non-scaling-stroke' in CSS.
        //     // Move the entire force group
        //     d3.select('#forceGroup')
        //         .attr('transform', d3.event.transform);
        // }
        // end todo

        // Append defs so we can create our markers.
        if (this.forceG.select('defs').empty()) {
            this.forceG.append('defs');
        }

        let markerWidth = 6, markerHeight = 4;

        // Add link-specific markers.
        this.forceG.selectAll('defs')
            .selectAll('marker')
            .data(this.vLinks)
            .join('marker')
            // Every marker gets an ID so we can reference it later.
            .attr('id', (d, i) => `marker_${i}`)
            .attr('markerWidth', markerWidth)
            .attr('markerHeight', markerHeight)
            .attr('refX', _ => (markerWidth * 1.25))
            .attr('refY', markerHeight / 2)
            .attr('orient', 'auto')
            .append('polygon')
            .attr('points', `0 0, ${markerWidth + ' ' + markerHeight / 2}, 0 ${markerHeight}`)
            .attr('fill', d => d3.interpolateViridis(this.linkColorScale(d.max_bandwidth))) //viridis is a color-blind accessible color scale
            .on('mouseover', linkMouseOverHandler)
            .on('mouseout', linkMouseOutHandler)
            .on('mousemove', () => {
                // Updates position of global tooltip.
                this.floatingTT.style('left', (d3.event.pageX + 10) + 'px').style('top', (d3.event.pageY + 10) + 'px')
            });

        // Add links.
        this.allLinks = this.allLinks
            .data(this.vLinks)
            .join('line')
            .classed('link', true)
            // .attr('stroke-width', d => packetScale(d.packet_count))
            .attr('stroke-width', 1)
            .attr('stroke', d => d3.interpolateViridis(this.linkColorScale(d.max_bandwidth))) //viridis is a color-blind accessible color scale
            // Should be dashed if the bandwidth is unknown
            .classed('unknown_bw_dashed', d => d.unknown_bw)
            // Marker end using the markers defined above.
            .attr('marker-end', (d, i) => `url(#marker_${i})`)
            // Add ability to view link speed on mouseover.
            .on('mouseover', linkMouseOverHandler)
            .on('mouseout', linkMouseOutHandler)
            .on('mousemove', () => {
                // Updates position of global tooltip.
                this.floatingTT.style('left', (d3.event.pageX + 10) + 'px').style('top', (d3.event.pageY + 10) + 'px')
            });

        this.simulation.nodes(this.nodeValues);

        if (!this.showMap) {
            this.simulation.force('link', d3.forceLink(this.vLinks).id(d => d.id));
        }

        this.simulation.alpha(1).restart();

        /* ###### Helpers and Handlers for update() ####### */

        /**
         * Helper method to get traffic info from auxiliary-info enabled nodes (i.e. stardust, tsds) into acceptable
         * format for secondary d3 vis.
         *
         * Returns the traffic info and the keys available in the traffic info, as {'info': {...}, 'keys': [...]}
         */
        function generateTrafficInfo(packets) {
            let trafficInfo = {};
            let trafficKeys = new Set();

            for (let packet of packets) {
                // Merge all the packets together
                if (packet['traffic_info']) {
                    trafficInfo = {
                        ...trafficInfo,
                        ...packet['traffic_info']
                    }

                    // Merge sets to
                    for (let k of Object.keys(packet['traffic_info'])) {
                        trafficKeys = new Set([...trafficKeys, ...Object.keys(packet['traffic_info'][k])]);
                    }
                }

            }

            trafficKeys = [...trafficKeys].sort();

            // Remove the 'ts' key from trafficKeys.
            let tsIdx = trafficKeys.findIndex(d => d === 'ts');
            if (tsIdx) {
                trafficKeys.splice(tsIdx, 1);
            }

            return {'info': trafficInfo, 'keys': trafficKeys};
        }

        /**
         * Helper method to generate tooltip stats (TTS) for each link.
         * @param link Link, must have max_bandwidth property.
         * @param d3Selection d3 d3Selection to append the text to.
         */
        function generateTTSLink(link, d3Selection) {
            d3Selection.selectAll('text').remove();
            let bwLabel = "unknown bandwidth";
            if (!link.unknown_bw) {
                bwLabel = `${d3.format('~s')(link.max_bandwidth)}bps`
            }
            d3Selection.append('text')
                .text(bwLabel);
        }

        function linkMouseOverHandler(link) {
            that.floatingTT.transition().duration(200).style('opacity', 0.9);
            generateTTSLink(link, that.statsTT);
        }

        function linkMouseOutHandler() {
            that.floatingTT.transition().duration(200).style('opacity', 0);
        }

        /**
         * Generate tooltip stats (TTS) for nodes. Not complicated, just abstracted b/c it's used more than once.
         */
        function generateTTS(d, packets, selection) {
            selection.selectAll('text').remove();
            selection.append('text')
                .text(`${d.ip ? d.ip : ''} (${d.org}) | ` +
                    `${packets.length} packets | ` +
                    `${d.max_bandwidth ? 'Max bandwidth: ' + d3.format('~s')(d.max_bandwidth) + 'bps |' : ''} ` +
                    `RTT (mean): ${d3.format('.3r')(d3.mean(packets, p => p.rtt))}`);

            // TODO: Add notice if no graph is available - this will require that the tooltip be changed or something
            //  like that. The current method (appending text element) doesn't work because text is an SVG specific
            //  thing and we're not appending to an SVG. Either the div will need hard constraints on size and HTML
            //  added, or an SVG needs to be added. There may be other ways of doing it but that's what makes sense
            //  off the top of my head.
        }

        /**
         * Takes a packet ID and makes it safe for CSS stuff.
         */
        function safePacketID(packetID) {
            let safe = CSS.escape(packetID.replace(/(\s|\.|\(|\))+/g, '_'));
            return safe.slice(-1) === '_' ? safe.slice(0, -1) : safe;
        }

        /**
         * Shows the global tooltip on mouseover (if applicable)
         */
        function nodeMouseoverHandler(node) {
            if (d3.select(`#tooltip_${safePacketID(node.id)}`).node() !== null) return;

            that.floatingTT.transition().duration(200).style('opacity', 0.9);

            let packets = node.packets;

            let trafficInfo = generateTrafficInfo(packets);

            generateTTS(node, packets, that.statsTT);

            // Append graph if applicable.
            if (node.id.startsWith('ip') && Object.keys(trafficInfo).length > 0) {
                // Show d3 vis of netbeam data
                that.auxGraph(trafficInfo, that.floatingTT);
            }
        }

        /**
         * Hide global tooltip on mouseout (if applicable)
         */
        function nodeMouseoutHandler() {
            that.floatingTT.transition().duration(200).style('opacity', 0);
            that.floatingTT.selectAll('svg').remove();
        }

        /**
         * Expand nodes on single click (no drag)
         */
        function nodeClickHandler(d) {
            d3.event.preventDefault();
            if (that.expandNode(d)) {
                // TODO: Signal the frontend that all nodes have been expanded.
                // Without signaling the frontend the potential for desync between the expand/collapse text and action
                // being performed is introduced.
                // let all_expanded_temp = true;
                // for (let node of that.node_values) {
                //     if (!node.expanded) {
                //         all_expanded_temp = false;
                //         break;
                //     }
                // }
                // that.expanded = all_expanded_temp;
                that.update();
            }
        }

        /**
         * Pin draggable tooltip on double click (if applicable)
         */
        function nodeDblClickHandler(d) {
            d3.event.preventDefault();

            if (d3.select(`#tooltip_${safePacketID(d.id)}`).node() !== null) {
                return;
            } else {
                that.floatingTT.selectAll('svg').remove();
            }

            // Create the tooltip div
            let tooltip = d3.select(that.rootElPathOrID)
                .append('div')
                .attr('id', `tooltip_${safePacketID(d.id)}`)
                .classed('tooltip removable', true);

            // Append tooltip stats
            generateTTS(d, d.packets, tooltip.append('div'));

            // Initial attributes
            let initialX = 0;
            let initialY = 0;
            let updatedX = 0;
            let updatedY = 0;

            // Set up move on tooltip drag
            tooltip.on('mousedown', function () {
                // If we are clicking on the select list we don't want to be able to drag or do anything other than
                // change the selection option, so we just return.
                if (d3.event.target.nodeName && d3.event.target.nodeName === 'SELECT') {
                    return;
                }

                // If the event is NOT on the select list (i.e. changing the y axis scale) then we want to stop
                // the default action - this prevents text from being highlighted when we drag.
                d3.event.preventDefault();
                d3.select(this).raise();

                // Need to keep reference to this tooltip.
                let tt = this;

                initialX = d3.event.clientX;
                initialY = d3.event.clientY;

                // Attach listener to body to prevent drag from breaking when you move off of the tooltip.
                d3.select('body').on('mousemove', () => {
                    // Prevents text highlighting while dragging.
                    d3.event.preventDefault();

                    updatedX = initialX - d3.event.clientX;
                    updatedY = initialY - d3.event.clientY;
                    initialX = d3.event.clientX;
                    initialY = d3.event.clientY;

                    // Update position.
                    tt.style.top = (tt.offsetTop - updatedY) + 'px';
                    tt.style.left = (tt.offsetLeft - updatedX) + 'px';
                });
            });

            // Remove mousemove listener from body on mouseup.
            tooltip.on('mouseup', function () {
                d3.select('body').on('mousemove', null);
            });

            // Remove on double click
            tooltip.on('dblclick', function () {
                d3.select(this).remove();
            });

            // Start out in default position
            tooltip.style('left', (d3.event.pageX + 10) + 'px')
                .style('top', (d3.event.pageY + 10) + 'px');

            let trafficInfo = generateTrafficInfo(d.packets);

            if (trafficInfo.keys.length === 0) {
                return;
            }

            if (d.id.startsWith('ip')) {
                // Add the d3 vis for netbeam info
                that.auxGraph(trafficInfo, tooltip, true);
            }
        }
    }

    /**
     * Sets all nodes to be expanded or contracted, depending on the value of this.expanded.
     * The forcemap doesn't keep track of expanded state, it is only set by the expand/contract button.
     */
    nodeExpansionToggle() {
        if (this.expanded) {
            this.setData(this.unclusteredData);
        } else {
            for (let node of this.nodeValues) {
                this.expandNode(node);
            }
        }

        // Reset fixed positions in network view.
        if (!this.showMap) {
            for (let node of this.nodeValues) {
                node.fx = null;
                node.fy = null;
            }
        }

        this.expanded = !this.expanded;

        this.update();
    }

    /**
     * clusterBy takes a map of entities with an 'id' property and returns a map of new entities that reference the
     * input entities as children. Clustering is breadth-first driven by the given label equality, degree, and
     * relationship parameters.
     * @param entities - Map of entities with ID property.
     * @param getLabel - Function to access entity property acting as cluster label.
     * @param getRelationships - Function to access entity property containing inter-entity relationships (i.e. source
     * and destination entity IDs).
     * @param idPrefix - Optional; prefix for ID of resulting clusters.
     * @returns Map that goes from ID
     */
    clusterBy(entities, getLabel, getRelationships, idPrefix = undefined) {
        let result = new Map();

        // Helper method for cleanliness
        let addToCluster = (clusterID, entity) => {
            if (!result.has(clusterID)) {
                // Use ES6 Proxy to recursively access properties of hierarchical clusters (see `handler` def)
                result.set(clusterID, new Proxy(({id: clusterID, children: new Map()}), propHandler));
            }
            // Set the children of the proxy to be the actual entity.
            result.get(clusterID).children.set(entity.id, entity);
        }

        let orphans = [...entities.keys()];
        let clusterCount = new Map();

        let i = 0;
        while (i < orphans.length) {
            // Start a new cluster from an unclustered entity
            const orphan = entities.get(orphans[i]);

            // label is the org label - lambda passed by calling function
            const label = getLabel(orphan);

            // Disjoint clusters of the same label are enumerated for distinctness
            if (!clusterCount.has(label))
                clusterCount.set(label, 0);
            clusterCount.set(label, clusterCount.get(label) + 1);

            // clusterID is the idPrefix + org (label) + cluster count
            let clusterID = idPrefix ? `${idPrefix}(${label})` : label;
            clusterID += ` cluster-${clusterCount.get(label)}`;

            let candidates = [orphans[i]];
            const visited = new Set();

            while (candidates.length > 0) {
                const candidateID = candidates.pop();
                const candidate = entities.get(candidateID);

                if (!visited.has(candidateID)) {
                    visited.add(candidateID); // Don't check this candidate again for this cluster
                    if (getLabel(candidate) === label) {
                        // Found a match, add to result
                        addToCluster(clusterID, candidate);

                        // getRelationships is a lambda that returns a set of the source ids and target ids?
                        const neighbors = Array.from(getRelationships(candidate));

                        // Add neighbors as new search candidates
                        candidates = candidates.concat(neighbors);

                        // This entity now belongs to a cluster, so we remove orphans
                        orphans.splice(orphans.indexOf(candidateID), 1);
                    }
                }
            }
        }
        return result;
    }
}