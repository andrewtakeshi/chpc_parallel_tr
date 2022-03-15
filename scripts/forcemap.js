/**
 * Traceroute visualization; uses a map to display hops spatially and a force map to add an element of interactivity +
 * handle collisions between nodes in roughly the same area.
 *
 * @author Paul Fischer, Andrew Golightly
 */
class ForceMap {
    /**
     * Constructs a new force map.
     * @param root_element  Path or ID. Must be selectable by d3. Typically this is just the div where the force map
     * visualization should go.
     * @param showMap       Boolean which determines if the map should be initially shown or hidden. The force map
     * is configured to use lat/lon to map the nodes to their respective locations if the map is shown, or to place the
     * nodes in a roughly straight line if it is hidden.
     */
    constructor(root_element, showMap = true) {
        // Common elements
        this.showMap = showMap;
        this.rootElement = root_element;
        this.rootElementElement = d3.select(root_element).node();
        this.width = this.rootElementElement.clientWidth;
        this.height = 0.75 * this.rootElementElement.clientWidth;

        // Map specific - see d3-geo for more information.
        // this.projection = d3.geoEquirectangular();
        // this.path = d3.geoPath().projection(this.projection);
        this.packets = new Map();

        // Force specific - see d3-force for more information.
        this.node_data = new Map();
        this.node_visual_alias = new Map();
        this.atr_iframes = new Map();

        this.linkColorScale = d3.scaleQuantile()
            .domain([0, 100000000, 250000000, 500000000, 1000000000, 2000000000, 5000000000, 10000000000, 20000000000,
                40000000000, 80000000000, 100000000000, 400000000000])
            // .domain(d3.extent(this.nodeValues, d => d.max_bandwidth ? d.max_bandwidth : 0))
            .range([
                'rgb(194, 211, 231)',
                'rgb(197, 194, 208)',
                'rgb(198, 178, 185)',
                'rgb(198, 161, 163)',
                'rgb(196, 145, 142)',
                'rgb(193, 128, 121)',
                'rgb(189, 112, 100)',
                'rgb(184, 95, 80)',
                'rgb(177, 78, 61)',
                'rgb(170, 59, 41)',
                'rgb(163, 37, 22)',
                'rgb(154, 0, 0)']);

        // Global tooltip - this is different from the "pinned" tooltips.
        this.floating_tooltip = d3.select(root_element)
            .append('div')
            .attr('id', 'forcemap_tooltip')
            .classed('tooltip', true);
        this.tooltip_stats = this.floating_tooltip
            .append('div');

        this.setup();
    }

    setup() {
        this.svg = d3.select(this.rootElement)
            .append('svg')
            .attr('width', this.width)
            .attr('height', this.height)
            .attr('id', 'mainVisSVG')
            // .style('stroke', 'black')
            // .style('stroke-width', '1.8')
            .style('display', 'block')
            .style('margin', 'auto');

        this.zoom = d3.zoom()
            // TODO: possibly get working w/ config file - currently load of config happens after load of this for whatever reason.
            .scaleExtent([1, 10])
            .translateExtent([[-this.width + 150, -this.height + 150], [2 * this.width - 150, 2 * this.width - 150]])
            // We use double click for something else, so we override the zoom behaviour for this event.
            .filter(() => !(d3.event.type === 'dblclick' || d3.event.type === 'wheel'))
            .on('zoom', this.zoomHandler);

        // All d3-force related things go to forceG.
        this.forceG = this.svg.append('g')
            .attr('id', 'forceGroup');

        // All d3-geo (the map) related things go to mapG
        this.mapG = this.svg.append('g')
            .attr('id', 'mapGroup');

        // Max bandwidth group overlay on top of the map/force vis.
        this.maxBW = this.svg.append('g');

        // TODO: Remove attributes from here - should be applied directly to links or done in CSS.
        // Create group for all the links
        this.all_links = this.forceG.append('g')
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
            .attr('fill', d => d)
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

        // Disables or enables the map, depending on the value of this.showMap.
        this.toggleMap();
        // Sets the desired force behavior depending on the value of this.showMap.
        this.setSimulation();

        // We call update directly so that we don't "collapse" any nodes + it's easier than figuring out why calling it
        // the same way that all the other updates are done doesn't work.
        this.update();
    }

    resize(width, height) {
        // todo: remove or redraw any pinned nodes
        this.width = width;
        this.height = height;
        console.log(`w: ${width}, h: ${height}`);
        d3.select(this.rootElement).selectAll('svg').remove();
        this.setup();
        // this.simulation.alphaTarget(0.3).restart();
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
     * @returns
     */
    zoomInfo() {
        let zoomOutline = this.mapG.selectAll('path').node();
        return zoomOutline ? d3.zoomTransform(zoomOutline).k : 1;
    }

    zoomIn() {
        let newZoom = this.getNewZoomLevel(true);
        this.zoom.scaleTo(this.svg, newZoom);
        return newZoom;
    }

    zoomOut() {
        let newZoom = this.getNewZoomLevel(false);
        this.zoom.scaleTo(this.svg, newZoom);
        return newZoom;
    }

    getNewZoomLevel(zoomIn = false) {
        let oldZoom = this.zoomInfo();
        let scaleExtent = this.zoom.scaleExtent();
        let clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

        let newZoom = zoomIn ? 1.5 * oldZoom : 0.66 * oldZoom;

        return clamp(newZoom, scaleExtent[0], scaleExtent[1]);
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

        let all_nodes = d3.select('#forceGroup')
            .selectAll('g.single_node');

        // If force nodes exist, perform force transforms
        if (all_nodes.nodes().length > 0) {
            // Select image and circle and perform appropriate transforms
            all_nodes.selectAll('circle')
                .attr('r', d => d.radius / d3.event.transform.k)
                .attr('stroke-width', 1 / d3.event.transform.k);
            all_nodes.selectAll('image')
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

    clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
    }

    /**
     * Hide or show the map, depending on the value of this.showMap.
     */
    toggleMap() {
        if (this.showMap) {
            // Draw the map, enable and reset zoom.
            this.zoom.on('zoom', this.zoomHandler);
            this.svg.call(this.zoom.transform, d3.zoomIdentity);
            this.drawMap();
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

        // // We call update directly so that we don't "collapse" any nodes + it's easier than figuring out why calling it
        // // the same way that all the other updates are done doesn't work.
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
            let denominator = d3.max(d3.selectAll('g.single_node').nodes(), d => d.__data__.ttl);
            let that = this;

            this.simulation = d3.forceSimulation()
                .force('link', d3.forceLink()
                    .strength(0.5)
                    .id())
                .force('charge', d3.forceManyBody()
                    .distanceMax(100))
                // .force('center', d3.forceCenter(this.width / 2, this.height / 2))
                .force('forceX', d3.forceX(d => (d.ttl * ((that.width - 100) / denominator)) + 50))
                .force('forceY', d3.forceY(this.height / 2)
                    .strength(0.3))
                .force('collision', d3.forceCollide()
                    .radius(d => d.diameter));
        }

        // Common to both simulations; updates the link and node positions on every tick of the simulation.
        this.simulation.on('tick', () => {
            this.all_links
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
            d.fx = null;
            d.fy = null;
        }

        return d3.drag()
            // Needed for smooth dragging, along with calling drag from the group (i.e. g.single_node) rather than
            // calling on the circle
            // Update: removed this to fix the issue with drag when zoomed. Still no jittering, so I'm not entirely sure why it was required before.
            // .container(d3.select('#mainVisSVG').node())
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
     * Creates traffic graph using info scraped through auxiliary API.
     * @param trafficInfo - Traffic info gathered from auxiliary API
     * @param div - d3 selection corresponding to the root element to draw the graph on.
     * @param checks - Boolean which determines if the checkboxes controlling the additional information (i.e. discards,
     * errors, and unicast packets) should be added. By default this is false, and should only be set to true for the
     * pinned tooltips.
     */
    auxGraph(trafficInfo, div, checks = false) {
        let margin = {top: 30, right: 200, bottom: 30, left: 60};

        // o* is the overall or outer width/height.
        let oWidth = 850;
        let oHeight = 350;

        // i* is the inner width/height - i.e. o* - margins.
        let iWidth = oWidth - margin.left - margin.right;
        let iHeight = oHeight - margin.top - margin.bottom;

        // Append a new SVG for the traffic graph.
        let trafficGraph = div.append('svg')
            .attr('width', oWidth)
            .attr('height', oHeight)
            .append('g')
            .attr('transform', `translate(${margin.left}, ${margin.top})`);

        // timestamps used for setting up y axis.
        let timestamps = Object.keys(trafficInfo).map(d => parseInt(d));

        // array of objects; each object should at least have the keys ts (timestamp), traffic_in, and traffic_out. other
        // keys may be available depending on the data source and timestamp (i.e. stardust only sends certain metrics at
        // 5 minute intervals).
        let allValArr = Object.values(trafficInfo);

        let underscorinator = d => d.replace(/\s/g, '_').toLowerCase();

        let keyify = (d, s) => {
            let d_split = d.split(s);
            let ret = d_split[0].toLowerCase();
            for (let i = 1; i < d_split.length - 1; i++) {
                ret += `_${d_split[i].toLowerCase()}`;
            }
            return ret;
        }

        // Names here MUST correspond to keys in the auxiliary data dictionary (i.e. netbeam, stardust).
        let types = ['Traffic In', 'Traffic Out', 'Unicast Packets In', 'Unicast Packets Out',
            'Errors In', 'Errors Out', 'Discards In', 'Discards Out', 'Packets In', 'Packets Out'];

        // types_set is used for setting up the different y scale values.
        let types_set = new Set(types.map(d => keyify(d, ' ')));

        // This should have at least as many values in the range as there are entries in types. If this has fewer entries
        // it "wraps" around, which isn't the desired behaviour.
        let colorScale = d3.scaleOrdinal()
            .domain(types.map(d => underscorinator(d)))
            .range(['steelblue', 'red', 'blue', 'crimson', 'cadetblue', 'darksalmon', 'skyblue', 'violet', 'gray', 'darkmagenta']);

        // Measurement is just the first word, i.e. "traffic" or "errors"
        let measurement_filter = (valArr, measurement) => {
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
        for (let measurement of types_set) {
            yScales[measurement] = d3.scaleLinear()
                // Use the max of 1 & measurement result to ensure that there is some difference for all measurements, i.e.
                // discards are usually 0 but they should show up on the bottom
                .domain([0, d3.max([1, d3.max(measurement_filter(allValArr, measurement))])])
                // .domain(d3.extent(measurement_filter(allValArr, measurement)))
                .range([iHeight, 0]);
        }

        // Create a new group
        let yAxis = trafficGraph.append('g')
            .attr('id', `y_axis_${div.attr('id')}`);
        yAxis.call(d3.axisLeft(yScales['traffic'])
            .ticks(6)
            .tickFormat(d => d3.format('~s')(d) + 'bps'));

        // Measurement here is the full name (i.e. traffic_in or errors_out).
        let add_path_and_circs = (measurement, color) => {

            if (d3.select(`#${measurement}_line_${div.attr('id')}`).node() !== null) {
                d3.select(`#${measurement}_line_${div.attr('id')}`).remove();
                d3.select(`#${measurement}_circs_${div.attr('id')}`).remove();
                return;
            }

            // let selectedYScale = yScales[`${measurement.split('_')[0]}`];
            // should be everything except for the first/last
            let selectedYScale = yScales[keyify(measurement, '_')];

            trafficGraph.append('path')
                .attr('id', `${measurement}_line_${div.attr('id')}`)
                .datum(allValArr.filter(d => `${measurement}` in d))
                .attr('fill', 'none')
                .attr('stroke', color)
                .attr('stroke-width', 1.5)
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
                .attr('r', 1.5)
                .attr('fill', color)
                .attr('cx', d => xScale(d.ts))
                .attr('cy', d => selectedYScale(d[measurement]))
                .on('mouseover', d => console.log(d[measurement]));
        }

        if (checks) {
            let list_items = div.append('div')
                .style('position', 'absolute')
                .style('top', `${margin.top}px`)
                .style('right', '20px')
                .classed('checkbox-area', true)
                .attr('width', `${margin.right - 20}px`)
                .attr('height', `${iHeight}px`);

            if (list_items.selectAll('ul').nodes().length === 0) {
                list_items.append('ul');
            }

            // Bind data to the list items
            list_items.selectAll('ul')
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
                    let val = underscorinator(d);
                    add_path_and_circs(val, colorScale(val));
                })
                // Prevent dblclick on checkbox from hiding the tooltip.
                .on('dblclick', _ => d3.event.stopPropagation());

            checkboxes.selectAll('input')
                .filter(d => d === types[0] || d === types[1])
                .property('checked', true);

            checkboxes.append('label')
                .attr('for', d => `checkbox_${underscorinator(d)}_${div.attr('id')}`)
                .style('color', d => colorScale(underscorinator(d)))
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
                .data([...types_set])
                .join('option')
                .attr('value', d => d)
                .text(d => d.replace('_', ' '));

            yScaleSelect.on('change', _ => {
                let key = d3.event.target.value;
                if (key === 'traffic') {
                    yAxis.call(d3.axisLeft(yScales[key])
                        .ticks(6)
                        .tickFormat(d => d3.format('~s')(d) + 'bps'));
                } else {
                    yAxis.call(d3.axisLeft(yScales[key]));
                }

                if (key === 'unicast') {
                    key = 'unicast_packets';
                }

                let _in = d3.select(`#checkbox_${key}_in_${div.attr('id')}`);
                let _out = d3.select(`#checkbox_${key}_out_${div.attr('id')}`);

                if (!_in.property('checked')) {
                    _in.node().click();
                }
                if (!_out.property('checked')) {
                    _out.node().click();
                }
            });


        } else {

            // TODO: Fix the legend line.
            let inLegend = trafficGraph.append('g')
                .attr('id', 'inLegend')
                .attr('transform', `translate(${iWidth}, 10)`);
            inLegend.append('text')
                .attr('style', 'font: 12px sans-serif;')
                .attr('opacity', 0.75)
                .text('in:');
            inLegend.append('line')
                .attr('x1', 0)
                .attr('x2', 20)
                .attr('y1', 0)
                .attr('y2', 0)
                .attr('stroke', colorScale('traffic_in'))
                .attr('stroke-width', '1.5px')
                .attr('transform', `translate(30, -5)`);
            inLegend.append('circle')
                .attr('cx', 40)
                .attr('cy', -5)
                .attr('fill', 'steelblue')
                .attr('r', 1.5);

            let outLegend = trafficGraph.append('g')
                .attr('id', 'outLegend')
                .attr('transform', `translate(${iWidth}, 20)`);
            outLegend.append('text')
                .attr('style', 'font: 12px sans-serif;')
                .attr('opacity', 0.75)
                .text('out:');
            outLegend.append('line')
                .attr('x1', 0)
                .attr('x2', 20)
                .attr('y1', 0)
                .attr('y2', 0)
                .attr('stroke', colorScale('traffic_out'))
                .attr('stroke-width', '1.5px')
                .attr('transform', `translate(30, -5)`);
            outLegend.append('circle')
                .attr('cx', 40)
                .attr('cy', -5)
                .attr('fill', 'red')
                .attr('r', 1.5);
        }
        add_path_and_circs('traffic_in', colorScale('traffic_in'));
        add_path_and_circs('traffic_out', colorScale('traffic_out'));
    }

    /**
     * Finds overall max bandwidth to display on the graph.
     */
    getOverallMaxBW() {
        let min_bw = Number.MAX_SAFE_INTEGER;
        let ip = null;

        if (!this.all_nodes_flat) {
            return;
        }

        // Select all nodes that are actual nodes (not abstracted org nodes)
        let nodes = Array.from(this.all_nodes_flat.values()).filter(d => d.id.startsWith('ip'));

        for (let node of nodes) {
            if (node.max_bandwidth && node.max_bandwidth < min_bw) {
                min_bw = node.max_bandwidth;
                ip = node.ip;
            }
        }

        this.maxBW.selectAll('text')
            .data([min_bw, ip])
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

        // Appends maxBW to the vis.
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

        // Set up scale for nodes diameters.
        let nodeDiameterScale = d3.scaleLinear()
            .domain(d3.extent([...this.node_data.values()], v => v.packets.length))
            .range([16, 24]);

        // Preload ATR Grafana iFrames for rendered IP nodes and generate links
        // TODO: Fix preload of iframes, the url is broken for whatever reason.
        for (let d of this.nodeValues) {
            if (d.id.startsWith('ip') && !this.atr_iframes.has(d.id)) {
                const url = getATRChartURL(d.ip, d.org);
                if (url.length > 0) {
                    const iframe = this.floating_tooltip.append('iframe')
                        .attr('width', 600)
                        .attr('height', 300)
                        .style('display', 'none')
                        .attr('src', url);
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
                    if (d.id !== t) {
                        let target = this.all_nodes_flat.get(t);
                        let d_mbw = d.max_bandwidth ? d.max_bandwidth : 0;
                        let t_mbw = target.max_bandwidth ? target.max_bandwidth : 0;
                        this.vLinks.push(({
                            source: d,
                            target: target,
                            // TODO: Tweak value of packet_scale to make links more visible + easier to hover over.
                            // Used to determine the width of the line.
                            packet_scale: Math.sqrt(target.packets.length),
                            // Used to determine line color + append info on hover.
                            max_bandwidth: Math.min(d_mbw, t_mbw)
                        }));
                    }
                }
            }

            // Add diameter and radius properties to every node.
            d.diameter = nodeDiameterScale(d.packets.length);
            d.radius = d.diameter / 2;
        }

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
            .attr('stroke-width', 1 / zoomDenominator)
            .attr('fill', d => this.getNodeColorOrg(d))
            .attr('opacity', d => known(d.domain) ? 0.0 : 1.0)
            // Doubleclick 'pins' the charts
            .on('dblclick', nodeDblClickHandler)
            // Click to expand nodes
            .on('click', nodeClickHandler)
            // Mouseover previews Grafana/d3 traffic charts
            .on('mouseover', nodeMouseoverHandler)
            .on('mouseout', nodeMouseoutHandler)
            .on('mousemove', () => {
                // Updates position of global tooltip.
                this.floating_tooltip.style('left', (d3.event.pageX + 10) + 'px').style('top', (d3.event.pageY + 10) + 'px')
            });

        // Drag is called on the group to prevent jittering.
        d3.selectAll('.single_node')
            .call(this.nodeDrag());

        // Append defs so we can create our markers.
        if (this.forceG.select('defs').empty()) {
            this.forceG.append('defs');
        }

        let markerWidth = 6, markerHeight = 4;

        // TODO: Fix marker positioning; I thought I fixed this, but apparently it was very late and my eyes are broken
        //  because this is most certainly still broken. The end of the marker should always be at the edge of the node,
        //  regardless of zoom level or line width.
        // Add link-specific markers.
        this.forceG.selectAll('defs')
            .selectAll('marker')
            .data(this.vLinks)
            .join('marker')
            // Every marker gets an ID so we can reference it later.
            .attr('id', (d, i) => `marker_${i}`)
            .attr('markerWidth', markerWidth)
            .attr('markerHeight', markerHeight)
            .attr('refX', d => (d.target.radius / d.packet_scale) + markerWidth)
            .attr('refY', markerHeight / 2)
            .attr('orient', 'auto')
            .append('polygon')
            .attr('points', `0 0, ${markerWidth + ' ' + markerHeight / 2}, 0 ${markerHeight}`)
            .attr('fill', d => this.linkColorScale(d.max_bandwidth))
            .on('mouseover', linkMouseOverHandler)
            .on('mouseout', linkMouseOutHandler)
            .on('mousemove', () => {
                // Updates position of global tooltip.
                this.floating_tooltip.style('left', (d3.event.pageX + 10) + 'px').style('top', (d3.event.pageY + 10) + 'px')
            });

        // Add links.
        this.all_links = this.all_links
            .data(this.vLinks)
            .join('line')
            .classed('link', true)
            .attr('stroke-width', d => d.packet_scale)
            .attr('stroke', d => this.linkColorScale(d.max_bandwidth))
            // Marker end using the markers defined above.
            .attr('marker-end', (d, i) => `url(#marker_${i})`)
            // Add ability to view link speed on mouseover.
            .on('mouseover', linkMouseOverHandler)
            .on('mouseout', linkMouseOutHandler)
            .on('mousemove', () => {
                // Updates position of global tooltip.
                this.floating_tooltip.style('left', (d3.event.pageX + 10) + 'px').style('top', (d3.event.pageY + 10) + 'px')
            });

        this.simulation.nodes(this.nodeValues);

        if (!this.showMap) {
            this.simulation.force('link', d3.forceLink(this.vLinks).id(d => d.id));
        }
        this.simulation.alpha(1).restart();

        /* ###### Helpers and Handlers ####### */

        // Helper method to get traffic info from Netbeam-polled nodes into acceptable format for secondary d3 vis.
        function generateTrafficInfo(packets) {
            let trafficInfo = {};

            for (let packet of packets) {
                // Merge all the packets together
                trafficInfo = {
                    ...trafficInfo,
                    ...packet['traffic_info']
                }
            }
            return trafficInfo;
        }

        // Link handlers
        function generateTTSLink(d, selection) {
            selection.selectAll('text').remove();
            selection.append('text')
                .text(`${d3.format('~s')(d.max_bandwidth)}bps`);
        }

        function linkMouseOverHandler(d) {
            that.floating_tooltip.transition().duration(200).style('opacity', 0.9);
            generateTTSLink(d, that.tooltip_stats);
        }

        function linkMouseOutHandler(d) {
            that.floating_tooltip.transition().duration(200).style('opacity', 0);
        }

        // Generate ToolTipStats. Not complicated, just abstracted b/c it's used more than once.
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

        // Shows the global tooltip on mouseover (if applicable)
        function nodeMouseoverHandler(d) {
            console.log(d.ttl);

            if (d3.select(`#tooltip${CSS.escape(d.id.replace(/(\s|\.|\(|\))+/g, '_'))}`).node() !== null) return;

            that.floating_tooltip.transition().duration(200).style('opacity', 0.9);

            let packets = d.packets;

            let trafficInfo = generateTrafficInfo(packets);

            generateTTS(d, packets, that.tooltip_stats);

            if (d.id.startsWith('ip') && that.atr_iframes.has(d.id)) {
                // Show grafana iframe
                that.atr_iframes.get(d.id).style('display', 'block');
            } else if (d.id.startsWith('ip') && Object.keys(trafficInfo).length > 0) {
                // Show d3 vis of netbeam data
                that.auxGraph(trafficInfo, that.floating_tooltip);
            }
        }

        // Hide global tooltip on mouseout (if applicable)
        function nodeMouseoutHandler(d) {
            that.floating_tooltip.transition().duration(200).style('opacity', 0);
            if (d.id.startsWith('ip') && that.atr_iframes.has(d.id)) {
                that.atr_iframes.get(d.id).style('display', 'none');
            }
            that.floating_tooltip.selectAll('svg').remove();
        }

        // Expand nodes on single click (no drag)
        function nodeClickHandler(d) {
            d3.event.preventDefault();
            if (that.expandNode(d)) {
                that.update();
            }
        }

        // Pin draggable tooltip on double click (if applicable)
        function nodeDblClickHandler(d) {
            d3.event.preventDefault();

            // todo: remove the floating tooltip before appending the new div
            // Make sure that isn't already pinned
            if (d3.select(`#tooltip${CSS.escape(d.id.replace(/(\s|\.|\(|\))+/g, '_'))}`).node() !== null) {
                return;
            } else {
                d3.select('#forcemap_tooltip').selectAll('div.removable').remove();
            }

            // Create the tooltip div
            // todo: fix trailing underscore
            let tooltip = d3.select(that.rootElement)
                .append('div')
                .attr('id', `tooltip${CSS.escape(d.id.replace(/(\s|\.|\(|\))+/g, '_'))}`)
                .classed('tooltip removable', true);

            // Append tooltip stats
            generateTTS(d, d.packets, tooltip.append('div'));

            // Initial attributes
            let draggable = false;
            let initialX = 0;
            let initialY = 0;
            let updatedX = 0;
            let updatedY = 0;

            // Make draggable on mousedown
            tooltip.on('mousedown', function () {
                // d3.event.preventDefault();
                d3.select(this).raise();
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

            // TODO: Make dragging the iframes easier. Not sure what the best way to do that is.
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
                    .attr('width', 600)
                    .attr('height', 300)
                    .attr('src', getATRChartURL(d.ip, d.org))
                    .style('display', 'block');
            } else if (d.id.startsWith('ip') && Object.keys(trafficInfo).length > 0) {
                // Add the d3 vis for netbeam info
                that.auxGraph(trafficInfo, tooltip, true);
            } else {
                // If neither data source is applicable, remove the tooltip
                tooltip.remove();
            }
        }
    }
}