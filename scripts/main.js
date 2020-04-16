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
})

// Finish the clusterBy method for the third time
// Get some basic visuals up (static graph viz method for entities)