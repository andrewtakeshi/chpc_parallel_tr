async function loadData() {
    const metadata = await d3.json("data/esmond_examples/metadata.json");
    const packets = await d3.json("data/esmond_examples/packets.json");
    return ({metadata: metadata, traces: packets});
}

loadData().then((result) => {
    console.log(inferNetworkGraph(result.traces));
})