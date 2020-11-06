import flask
from flask import request, jsonify
from server import d3_conversion

app = flask.Flask(__name__)
app.config["DEBUG"] = True


@app.route('/', methods=['GET'])
def home():
    return '''<h1>Internet analysis</h1>
<p>A prototype API for IP-layer datasets.</p>'''


@app.route('/api/v1/resources/traceroutes', methods=['GET'])
def traceroutes():
    if "dest" in request.args:
        dest = request.args["dest"]
    else:
        return "Error: No dest field provided. Please specify a destination address."

    source = None
    if "source" in request.args:
        source = request.args["source"]

    num_runs = 1

    if "num_runs" in request.args:
        num_runs = int(request.args["num_runs"])

    # Use the jsonify function from Flask to convert our list of
    # Python dictionaries to the JSON format.
    if source:
        if d3_conversion.check_pscheduler(source):
            response = d3_conversion.pscheduler_to_d3(source, dest, num_runs)
        else:
            return f"Error: pScheduler not found at {source}"
    else:
        response = d3_conversion.system_to_d3_threaded(dest, num_runs)

    response = jsonify(response)

    # Something required for hosting tool and API on same box
    response.headers.add('Access-Control-Allow-Origin', '*')
    return response


@app.route('/api/v1/resources/iporgs', methods=['GET'])
def iporgs():
    if "ip" in request.args:
        ip = request.args["ip"]
    else:
        return "Error: No 'ip' field provided. Please specify an IP address."

    response = d3_conversion.rdap_org_lookup(ip)
    response = jsonify(response)
    response.headers.add('Access-Control-Allow-Origin', '*')
    return response


app.run(host='0.0.0.0')
