const width = 600;
const height = 600;

async function loadData() {
    const metadata = await d3.json("data/esmond_examples/metadata.json");
    const packets = await d3.json("data/esmond_examples/packets.json");
    return ({metadata: metadata, traces: packets});
}

loadData().then(createChart);

// Get some basic visuals up (static graph viz method for entities)