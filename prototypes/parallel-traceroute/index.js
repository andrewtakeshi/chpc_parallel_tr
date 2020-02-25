var app = require('express')();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
const execSync = require('child_process').execSync;
const spawn = require('child_process').spawn;

// CHANGE CREDENTIALS TO MATCH LOCAL Neo4j SERVER
const neo4j_user = "neo4j"
const neo4j_pass = "test"

var regex_endpoint = RegExp('^([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])(\.([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9]))*$');

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', function (socket) {
    const address = socket.conn.remoteAddress;
    console.log('a user connected (' + address + ')');
    socket.on('disconnect', function () {
        console.log('a user disconnected (' + address + ')');
    });
    var jobs = 0;
    socket.on('traceroute_endpoint', function (endpoint, traceroute) {
        if (regex_endpoint.test(endpoint)) {
            var ps_traceroute;
            if (traceroute === "paris") {
                ps_traceroute = spawn('paris-traceroute', ['-q1', '-m50', '-M10', endpoint]);
            } else {
                ps_traceroute = spawn('traceroute', ['-q1', '-m50', endpoint]);
            }
            const ps_cypher = spawn('awk', ['-f', 'traceroute-to-cypher.awk']);
            const ps_ingest = spawn('cypher-shell', ['-a', 'bolt://localhost:7687', '-u', neo4j_user, '-p', neo4j_pass]);
            jobs += 1;
            io.emit('job_start', jobs);

            ps_traceroute.stdout.on('data', (data) => {
                ps_cypher.stdin.write(data);
            });
            ps_traceroute.stderr.on('data', (data) => {
                console.error(`stderr: ${data}`);
            });
            ps_traceroute.on('close', (code) => {
                if (code !== 0) {
                    console.error('traceroute exited with code ${code}');
                }
                ps_cypher.stdin.end();
            });

            ps_cypher.stdout.on('data', (data) => {
                ps_ingest.stdin.write(data);
            });
            ps_cypher.stderr.on('data', (data) => {
                console.error(`stderr: ${data}`);
            });
            ps_cypher.on('close', (code) => {
                if (code !== 0) {
                    console.error(`awk exited with code ${code}`);
                }
                ps_ingest.stdin.end();
            });

            ps_ingest.stderr.on('data', (data) => {
                console.error(`stderr: ${data}`);
            });
            ps_ingest.on('close', (code) => {
                if (code !== 0) {
                    console.error(`cypher-shell exited with code ${code}`);
                }
                jobs -= 1;
                io.emit('job_end', jobs);
                console.log("done with ingest; " + jobs + " remaining.");
            });

        } else {
            console.error('Invalid endpoint specified: ' + endpoint);
        }
    });
    socket.on('traceroute_data', function (msg) {
        const ps_traceroute = spawn('echo', [msg.replace(/"/g, '')]);
        const ps_cypher = spawn('awk', ['-v', 'root=null', '-f', 'traceroute-to-cypher.awk']);
        const ps_ingest = spawn('cypher-shell', ['-a', 'bolt://localhost:7687', '-u', neo4j_user, '-p', neo4j_pass]);
        jobs += 1;
        io.emit('job_start', jobs);

        ps_traceroute.stdout.on('data', (data) => {
            ps_cypher.stdin.write(data);
        });
        ps_traceroute.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
        });
        ps_traceroute.on('close', (code) => {
            if (code !== 0) {
                console.error('traceroute exited with code ${code}');
            }
            ps_cypher.stdin.end();
        });

        ps_cypher.stdout.on('data', (data) => {
            ps_ingest.stdin.write(data);
        });
        ps_cypher.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
        });
        ps_cypher.on('close', (code) => {
            if (code !== 0) {
                console.error(`awk exited with code ${code}`);
            }
            ps_ingest.stdin.end();
        });

        ps_ingest.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
        });
        ps_ingest.on('close', (code) => {
            if (code !== 0) {
                console.error(`cypher-shell exited with code ${code}`);
            }
            jobs -= 1;
            io.emit('job_end', jobs);
            console.log("done with ingest; " + jobs + " remaining.");
        });
    });
    socket.on('pscheduler_test_source', (endpoint) => {
        if (regex_endpoint.test(endpoint)) {
            io.emit('pscheduler_test_source_pending');
            const ps_curl = spawn('curl', ['--insecure', `https://${endpoint}/pscheduler`]);
            ps_curl.on('close', (code) => {
                io.emit('pscheduler_test_source_result', code);
                console.error(`curl exited with code ${code}`);
            });
        }
    });
    socket.on('pscheduler_submit', (sourceaddr, destaddr) => {
        if (regex_endpoint.test(sourceaddr) && regex_endpoint.test(destaddr)) {
            const ps_pscheduler = spawn('pscheduler', ['task', 'trace', '--source', sourceaddr, '--dest', destaddr]);
            const ps_awktrace = spawn('awk', ['-f', 'standardize-pscheduler-trace-output.awk']);
            const ps_awkcypher = spawn('awk', ['-v', `root=${sourceaddr}`, '-f', 'traceroute-to-cypher.awk']);
            const ps_ingest = spawn('cypher-shell', ['-a', 'bolt://localhost:7687', '-u', neo4j_user, '-p', neo4j_pass]);

            jobs += 1;
            io.emit('job_start', jobs);

            ps_pscheduler.stdout.on('data', (data) => {
                ps_awktrace.stdin.write(data);
            });
            ps_pscheduler.stderr.on('data', (data) => {
                console.error(`stderr: ${data}`);
            });
            ps_pscheduler.on('close', (code) => {
                if (code !== 0) {
                    console.error('pscheduler exited with code ${code}');
                }
                ps_awktrace.stdin.end();
            });

            ps_awktrace.stdout.on('data', (data) => {
                ps_awkcypher.stdin.write(data);
            });
            ps_awktrace.stderr.on('data', (data) => {
                console.error(`stderr: ${data}`);
            });
            ps_awktrace.on('close', (code) => {
                if (code !== 0) {
                    console.error(`awk exited with code ${code}`);
                }
                ps_awkcypher.stdin.end();
            });

            ps_awkcypher.stdout.on('data', (data) => {
                ps_ingest.stdin.write(data);
            });
            ps_awkcypher.stderr.on('data', (data) => {
                console.error(`stderr: ${data}`);
            });
            ps_awkcypher.on('close', (code) => {
                if (code !== 0) {
                    console.error(`awk exited with code ${code}`);
                }
                ps_ingest.stdin.end();
            });

            ps_ingest.stderr.on('data', (data) => {
                console.error(`stderr: ${data}`);
            });
            ps_ingest.on('close', (code) => {
                if (code !== 0) {
                    console.error(`cypher-shell exited with code ${code}`);
                }
                jobs -= 1;
                io.emit('job_end', jobs);
                console.log("done with ingest; " + jobs + " remaining.");
            });
        }
    });
});

http.listen(3001, function () {
    console.log('listening on *:3001');
});
