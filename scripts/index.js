let visibleNTTs = ({"traceroutes": []});
let hiddenNTTs = ({"traceroutes": []});
// Timeout values - pscheduler is 25 sec, system is 10 sec
const pscheduler_timeout = 250000;
const system_timeout = 250000;
let inQueue = 0;


/**
 * Handles pressing the reset button. Calls updateViz() after reset.
 */
async function resetBtnHandler() {
    // Reset forms.
    let forms = $("form");
    for (let form of forms) {
        form.reset();
    }

    // Hide and clear tables on reset.
    document.getElementById("current_run_table_area").style.visibility = "hidden";
    document.getElementById("netbeam_table_area").style.visibility = "hidden";
    document.getElementById("cr_table").getElementsByTagName('tbody')[0].innerHTML = "";
    document.getElementById("netbeam_accordion").innerHTML = "";

    // Remove all old traceroute data
    visibleNTTs.traceroutes = [];
    hiddenNTTs.traceroutes = [];

    // Call to updateViz() removes the actual visualization
    return await updateViz();
}

/**
 * Adds an entry to the current run table.
 * @param uuid - ID associated with the current run.
 */
function addToCRTable(uuid) {
    if (document.getElementById("esmond_ip_dest").value === "")
        return;

    document.getElementById("current_run_table_area").style.visibility = "visible";

    let tbody = document.getElementById('cr_table').getElementsByTagName('tbody')[0];
    let cell_ids = ['type', 'source', 'dest', 'numRuns', 'status', 'selected']

    // Add row and cells
    let row = tbody.insertRow();
    row.id = `${uuid}`;
    for (let i = 0; i < 6; i++) {
        row.insertCell(i);
        row.cells[i].id = `${uuid}_${cell_ids[i]}`
    }

    // Get cell data from DOM
    let source = document.getElementById("esmond_ip_source").value;
    let dest = document.getElementById("esmond_ip_dest").value;
    let type = source ? "pScheduler" : "System";
    let numRuns = document.getElementById("esmond_num_runs").value;

    // Set cell data
    row.cells[0].innerHTML = type;
    // Localhost or source host (pScheduler)
    row.cells[1].innerHTML = source ? source : self.location.hostname;
    row.cells[2].innerHTML = dest;
    row.cells[3].innerHTML = numRuns;
    row.cells[4].innerHTML = "Pending"
    row.cells[5].style.textAlign = "center";

    // Add checkbox + ability to hide/show run via handler
    let checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.onchange = function () {
        checkHandler(uuid, checkbox.checked).then(data => force_map.setData(data));
    }
    row.cells[5].appendChild(checkbox);
}

/**
 * Adds a timeout to the API calls - this can be adjusted above
 */
const timeout = (prom, time) => Promise.race([prom, new Promise((res) => setTimeout(
    () => res({'error': 'Timed out'}),
    time))]);

/**
 * Helper method. Adds or updates the table entry for each host.
 */
let netbeamTableHelper = (ip, label, hops, speed) => {
    // Add entry if it doesn't exist. Each entry is it's own table.
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

    // Helper method to convert UTC to readable time
    let normalizeUTCTime = (inDate) => {
        let x = new Date(inDate);
        return `${x.getMonth() + 1}/${x.getDate()}/${x.getFullYear()} ${x.getHours()}:${("0" + x.getMinutes()).substr(-2)}:${("0" + x.getSeconds()).substr(-2)}`
    };

    // Add each type of data to the table
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

/**
 * Adds netbeam information to table (shown below viz)
 */
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

/**
 * Packages the data in a way that is usable by the visualization (i.e. clustered into orgs)
 */
const updateViz = async () => {
    // Create new graph from
    let graph = await createInternetGraph(visibleNTTs.traceroutes);
    let org_graph = clusterBy(graph,
        (entity) => entity.org,
        (entity) => new Set([...entity.source_ids, ...entity.target_ids]),
        "Org");
    return org_graph;
}

/**
 * Handles checking/unchecking a box in the current run table.
 */
const checkHandler = async (id, shown) => {
    // List of entities to search and add to respectively
    let searchNTTs;
    let addNTTs;

    // If we are re-showing something, we want searchNTTs to be the list of currently hidden entities,
    // and we want to add our "found" entity to the list to show
    if (shown) {
        searchNTTs = hiddenNTTs;
        addNTTs = visibleNTTs;
        // Similarly, if we are hiding something we want searchNTTs to be the list of currently shown entities,
        // and we want to add our "found" entity to the list to hide
    } else {
        searchNTTs = visibleNTTs;
        addNTTs = hiddenNTTs;
    }

    // Find all traceroutes with matching IDs and move them between the two lists accordingly.
    for (let i = 0; i < searchNTTs.traceroutes.length; ++i) {
        if (searchNTTs.traceroutes[i].id === id) {
            addNTTs.traceroutes.push(searchNTTs.traceroutes[i]);
            searchNTTs.traceroutes.splice(i, 1);
            --i;
        }
    }

    // Update the visualization - the checkhandler sets the data after this update.
    return await updateViz();
}


/**
 * Runs an end to end traceroute.
 */
const e2eBtnHandler = async (source, dest, num_runs, uuid) => {
    // Handle undefined destination
    if (dest === null || dest === undefined || dest === '')
    {
        return;
    }
    let updateInQueue = () => {
        let innerHTML = '';
        if (inQueue > 0) {
            innerHTML = `<h3>${inQueue} ${inQueue > 1 ? 'Traceroutes' : 'Traceroute'} Running</h3>`;
        }
        document.getElementById('inQueue_area').innerHTML = innerHTML;
    }
    inQueue += parseInt(num_runs);
    updateInQueue();
    // Run the traceroute (with timeout)
    let result = await timeout(runTraceroute(source, dest, num_runs), source ? pscheduler_timeout : system_timeout)
        .then(
            // OnFulfillment
            (value) => {
                inQueue -= parseInt(num_runs);
                updateInQueue();
                if (value.error) {
                    // This will be timeout or pScheduler
                    document.getElementById(`${uuid}_status`).innerHTML = value.error;
                    return null;
                } else {
                    document.getElementById(`${uuid}_status`).innerHTML = 'Finished';
                    return value;
                }
            },
            // If rejected we ran into an unknown error
            _ => {
                inQueue -= parseInt(num_runs);
                updateInQueue();
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
    visibleNTTs.traceroutes = visibleNTTs.traceroutes.concat(result.traceroutes);

    return await updateViz();
}

/**
 * Change the displayed map.
 * @param selectedOption - Map to display (comes from map select dropdown 'value').
 */
function setTopojson(selectedOption) {
    let resourceString = '';
    switch (selectedOption) {
        case 'world':
            resourceString = 'resources/countries-50m.json';
            break;
        case 'us':
            resourceString = 'resources/states-10m.json';
            break;
        case 'eu':
            resourceString = 'resources/eu.json';
            break;
    }

    // Load the resource then perform any necessary filtering
    d3.json(resourceString).then(data => {
        data = topojson.feature(data, data.objects[Object.keys(data.objects)[0]]);

        // Remove US territories, Hawaii, and Alaska from the map
        if (selectedOption === 'us') {
            let remove_list = ['72', '78', '60', '66', '69', '15', '02'];
            for (let i = 0; i < data.features.length; i++) {
                let state = data.features[i];
                if (remove_list.includes(state.id)) {
                    data.features.splice(i, 1);
                    i--;
                }
            }
        }

        // Set the topography in the force_map, then draw it
        force_map.setTopography(data);
        force_map.drawMap();
    });
}

/**
 * Hides or shows the map.
 */
const toggleMapBtnHandler = async () => {
    force_map.showMap = !force_map.showMap;
    force_map.toggleMap();
    force_map.setSimulation();

    document.getElementById('map_toggle_btn').innerHTML = force_map.showMap ? 'Hide Map' : 'Show Map';

    return await updateViz();
}

/**
 * Handles changes to the map selector.
 */
const mapSelectHandler = async () => {
    if (!force_map.showMap) return;
    let selectedOption = document.getElementById('map_select').value;

    setTopojson(selectedOption);
    return await updateViz();
}

// Create the force map. By default the map is shown and we shown the world map.
const force_map = new ForceMap('#d3_vis');
setTopojson('world');