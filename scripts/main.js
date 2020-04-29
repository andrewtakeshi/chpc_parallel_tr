const width = 600;
const height = 600;

async function loadData() {
    const metadata = await d3.json("data/esmond_examples/metadata.json");
    const packets = await d3.json("data/esmond_examples/packets.json");
    return ({metadata: metadata, traces: packets});
}

loadData().then((result) => {
    const ips = inferNetworkGraph(result.traces);
    const registry_AS = registryFromEsmondTraceroute(result.traces);
    const clusters = clusterBy(ips, 
        (entity) => registry_AS.get(entity.ip),
        (entity) => new Set([...entity.source_ids, ...entity.target_ids]),
        "AS");
    console.log(clusters);


    chart = d3.select("body").append("svg")
        .attr("width", width)
        .attr("height", height);

    var nodes = Array.from(ips.values());
    var links = nodes.map( n => [...n.target_ids].map( dest_id => ({source: n.id, target: dest_id}) ) ).flat();

    const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id))  // change to current_alias
        .force("charge", d3.forceManyBody())
        .force("center", d3.forceCenter(width / 2, height / 2));

    const drag = simulation => {
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
    };

    chart.append("svg:defs").selectAll("marker")
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

    //nodes = nodes.concat(Array.from(clusters.values()));
    //simulation.nodes(nodes);
    const node = chart.append("g")
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.5)
        .selectAll("circle")
        .data(nodes)
        .join("circle")
        .attr("r", d => d.packets ? 5 : 8) // Scale
        .attr("fill", d => d.packets ? "blue" : "pink") // Scale
        .call(drag(simulation));

    node.on("dblclick", d => {
          console.log(d.id);
          d3.event.preventDefault();
          nodes = nodes.concat(Array.from(clusters.values()));
          simulation.nodes(nodes);
          console.log(nodes.length);
          console.log(node);
        })
        .merge(node);

    node.append("title")
        .text(d => `${d.id}\n\n 🍔`);

    const link = chart.append("g")
        .attr("stroke", "#999")
        .attr("stroke-opacity", 0.6)
        .attr("marker-end", "url(#end)")
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("stroke-width", 1);

    simulation.on("tick", () => {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);
        node
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);
        });
})

// Get some basic visuals up (static graph viz method for entities)