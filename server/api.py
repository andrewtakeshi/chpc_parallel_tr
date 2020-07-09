import flask
from flask import request, jsonify
import d3_conversion

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


    # Use the jsonify function from Flask to convert our list of
    # Python dictionaries to the JSON format.
    if source:
        if d3_conversion.check_pscheduler(source):
            result = d3_conversion.pscheduler_to_d3(source, dest)
        else:
            return f"Error: pScheduler not found at {source}"
    else:
        result = d3_conversion.system_to_d3(dest)

    return jsonify(result)

app.run(host='0.0.0.0')
