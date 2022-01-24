"""
Authors: Andrew Golightly, Paul Fischer
"""
import flask
from flask import request, jsonify
from server import d3_conversion, d3_conversion_utils
from flask_cors import CORS
import logging, sys

logging.basicConfig(stream=sys.stderr, level=logging.DEBUG)

app = flask.Flask(__name__)
app.config["DEBUG"] = True
cors = CORS(app)

logging.debug('running api.py NOT MAIN')

@app.route('/', methods=['GET'])
def home():
    """
    Home page. Returns a basic HTML page.
    """
    return '''<h1>Internet analysis</h1>
<p>A prototype API for IP-layer datasets.</p>'''


# TODO: Add a /api/v1/test page (or something like that) if pScheduler is replaced
# This will be used to test to see if the API server is running on the server, similar to the pScheduler test.
@app.route('/api/v1/test', methods=['GET'])
def test():
    """
    Test endpoint - used to see if API server is running
    :return:  JSON, content isn't super important. It's just examined to see if it exists.
    """
    response = {'success': 'api server running'}
    response = jsonify(response)
    response.headers.add('Access-Control-Allow-Origin', '*')
    return response


@app.route('/api/v1/resources/traceroutes', methods=['GET'])
def traceroutes():
    """
    Handles running traceroutes.
    :return: JSON string formatted for d3 with all additional information added.
    """
    # if "dest" in request.args:
    #     dest = request.args["dest"]
    # else:
    #     response = jsonify({'error': 'invalid destination'})
    #     response.headers.add('Access-Control-Allow-Origin', '*')
    #     return response

    # Check for destination not being empty happens client side
    dest = request.args['dest']

    # Checks for source for remote traceroute.
    source = None
    if "source" in request.args:
        source = request.args["source"]

    num_runs = 1

    if "num_runs" in request.args:
        num_runs = int(request.args["num_runs"])

    # Run remote traceroute
    if source:
        # pseudocode for replacing pscheduler
        # if d3_conversion_utils.check_api_server(source):
        #   response = requests... to server, with just the destination specified (to force a "system" tr from them)
        #   then just return the json() data retrieved.
        # I think this should work?

        # Check the source - if not found, return an error that works for the traceroute table.
        if d3_conversion_utils.check_pscheduler(source):
            print(f'{source} accepted as pScheduler source')
            response = d3_conversion.pscheduler_to_d3(source, dest, num_runs)
        else:
            response = {'error': 'pScheduler not found'}
    # Run a system traceroute
    else:
        response = d3_conversion.system_to_d3(dest, num_runs)

    print(response)

    # Use jsonify to convert python dictionary to json.
    response = jsonify(response)

    # Something required for hosting tool and API on same box - should be restricted more, but for development it works.
    response.headers.add('Access-Control-Allow-Origin', '*')
    return response


if __name__ == '__main__':
    logging.debug('running api.py from main')
    app.run(host='0.0.0.0')
