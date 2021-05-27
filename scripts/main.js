const width = 600;
const height = 600;

let entities = ({"traceroutes": []});
let hiddenNTTs = ({"traceroutes": []});
// Timeout values - pscheduler is 40 sec, system is 20 sec
const pscheduler_timeout = 40000;
const system_timeout = 20000;

// Adds a timeout to the API calls - this can be adjusted above
const timeout = (prom, time) => Promise.race([prom, new Promise((res) => setTimeout(
    () => res({'error': 'Timed out'}),
    time))]);

let netbeamTableHelper = (ip, label, hops, speed) => {
    if (!document.getElementById(`table_${ip}_${label}`)) {
        let collapse_body = document.getElementById(`collapse_body_${ip}`);
        collapse_body.innerHTML += `<table class="table table-bordered" id="table_${ip}_${label}">
                                        <thead>
                                            <tr>
                                                <th colspan="4" style="text-align: center">${label}</th>
                                            </tr>
                                            <tr>
                                                <th>TIME</th>
                                                <th>IN</th>
                                                <th>OUT</th>
                                                <th>SPEED</th>
                                            </tr>
                                        </thead>
                                        <tbody id="table_body_${ip}_${label}"></tbody>
                                        </table>`;
    }

    let tbody = document.getElementById(`table_body_${ip}_${label}`);

    let normalizeUTCTime = (inDate) => {
        let x = new Date(inDate);
        return `${x.getMonth() + 1}/${x.getDate()}/${x.getFullYear()} ${x.getHours()}:${("0" + x.getMinutes()).substr(-2)}:${("0" + x.getSeconds()).substr(-2)}`
    };

    hops.forEach(hop => {
        // Checks to see if value is in table already (using time)
        let rows = tbody.getElementsByTagName('tr');
        let hopExists = false;
        for (let row of rows) {
            if (row.cells[0].innerHTML === normalizeUTCTime(hop[0])) {
                hopExists = true;
                break;
            }
        }

        // If hop is not extant in table, adds to table
        if (!hopExists) {
            let row = tbody.insertRow();
            for (let i = 0; i < 4; i++) {
                row.insertCell(i);
            }
            row.cells[0].innerHTML = normalizeUTCTime(hop[0]);
            row.cells[1].innerHTML = hop[1];
            row.cells[2].innerHTML = hop[2];
            row.cells[3].innerHTML = speed;
        }
    })
}

const netbeamTable = async (traceroutes) => {
    let accordion_div = document.getElementById('netbeam_accordion');
    document.getElementById('netbeam_table_area').style.visibility = "visible";
    traceroutes.forEach(traceroute => {
        traceroute.packets.forEach(packet => {
            let ip = packet.ip;
            let speed = packet.speed ? packet.speed : "Unknown";
            if ("traffic" in packet) {
                // Set up card for each individual IP address. Done in traffic because
                // it's the first table generated.
                if (accordion_div.getElementsByClassName('card').length === 0) {
                    accordion_div.innerHTML += `<div class="card"><div class="card-header">Netbeam Info</div></div>`;
                }
                if (!document.getElementById(`collapse_${ip}`)) {
                    accordion_div.innerHTML +=
                        `<div class="card">
                            <div class="card-header">
                                <a class="collapsed card-link" data-toggle="collapse" href="[id='collapse_${ip}']">
                                    ${ip}
                                </a>
                            </div>
                            <div id="collapse_${ip}" class="collapse" data-parent="#netbeam_accordion">
                                <div class="card-body" id="collapse_body_${ip}"></div>
                            </div>
                        </div>`;
                }
                netbeamTableHelper(ip, 'Traffic', packet.traffic, speed);
            }
            if ("unicast_packets" in packet) {
                netbeamTableHelper(ip, "Unicast_packets", packet.unicast_packets, speed);
            }
            if ("discards" in packet) {
                netbeamTableHelper(ip, "Discards", packet.discards, speed);
            }
            if ("errors" in packet) {
                netbeamTableHelper(ip, "Errors", packet.errors, speed);
            }
        })
    });
}

const updateViz = async () => {
    let graph = await createInternetGraph(entities.traceroutes);
    let org_graph = clusterBy(graph,
        (entity) => entity.org,
        (entity) => new Set([...entity.source_ids, ...entity.target_ids]),
        "Org");
    return org_graph;
}

/**
 * Handles checking/unchecking a box in the current run table.
 * @param id
 * @param shown
 * @returns {Promise<void>}
 */
const checkHandler = async (id, shown) => {
    let searchNTTs = null;
    let addNTTs = null;

    if (shown) {
        searchNTTs = hiddenNTTs;
        addNTTs = entities;
    } else {
        searchNTTs = entities;
        addNTTs = hiddenNTTs;
    }

    let foundObj = null;
    let foundIter = 0;

    for (let i = 0; i < searchNTTs.traceroutes.length; i++) {
        if (searchNTTs.traceroutes[i].id === id) {
            foundObj = searchNTTs.traceroutes[i];
            foundIter = i;
            break;
        }
    }

    searchNTTs.traceroutes.splice(foundIter, 1);
    addNTTs.traceroutes.push(foundObj);

    return await updateViz();
}

/**
 * Runs an end to end traceroute.
 */
const e2eBtnHandler = async (source, dest, num_runs, uuid) => {
    // Run the traceroute (with timeout)
    let result = await timeout(runTraceroute(source, dest, num_runs), source ? pscheduler_timeout : system_timeout)
        .then(
            // OnFulfillment
            (value) => {
                if (value.error) {
                    document.getElementById(`${uuid}_status`).innerHTML = value.error;
                    return null;
                } else {
                    document.getElementById(`${uuid}_status`).innerHTML = 'Finished';
                    return value;
                }
            },
            // OnRejection
            _ => {
                document.getElementById(`${uuid}_status`).innerHTML = 'Unknown Error';
                return null;
            }
        );

    // Error occured - either timed out or pscheduler error
    if (result == null) {
        // Disable checkbox to prevent further modification
        let checkbox = document.getElementById(`${uuid}_selected`).children[0];
        checkbox.checked = false;
        checkbox.disabled = true;
        return;
    }

    // Every traceroute from this run is given the same ID to enable/disable them later
    for (let traceroute of result.traceroutes) {
        traceroute.id = uuid;
    }

    // Add to the netbeam table
    netbeamTable(result.traceroutes);

    // Update the visualization
    entities.traceroutes = entities.traceroutes.concat(result.traceroutes);

    let data = await updateViz();

    viz.setData(data);
}

const viz = new Vizualization("#d3_vis");
