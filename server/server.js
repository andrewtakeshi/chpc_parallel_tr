// Traceroute JSON format
// { 
//     "traceroutes": [
//         {
//             "ts": <timestamp in seconds>,
//             "source_address": <hostname or IP address>,
//             "target_address": <hostname or IP address>,
//             "packets": [
//                 {
//                     "ip": <IP address of hop>,
//                     "ttl": <hop number>,  // implied by index?
//                     "rtt": <round trip time (seconds)>  
//                 },
//                 ...
//             ]
//         },
//         ...
//     ]
// }
//
// Network JSON format
// {
//     "ip_nodes": {
//         "155.101.3.198": {
//             "registry_info": {
//                 "as_number": <AS id number>,
//                 "as_name": <AS name>,
//                 // geospatial info, contact info, etc.
//             },
//             "packets": [
//                 {
//                     "source_address": <hostname or IP address>,
//                     "target_address": <hostname or IP address>,
//                     "ttl": <hop number>,
//                     "rtt": <round trip time (seconds)>  
//                 },
//                 ...
//             ]
//         },
//         ...
//     }
// }


chpc_esmond_server = "uofu-science-dmz-bandwidth.chpc.utah.edu"
const get_esmond = (
    esmond_server = chpc_esmond_server,
    source_ip = null,
    dest_ip = null,
    min_ts = null,
    max_ts = null
    ) => {
        return ({});
}