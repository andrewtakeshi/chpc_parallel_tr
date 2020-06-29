import flask
from flask import request, jsonify

app = flask.Flask(__name__)
app.config["DEBUG"] = True

# Create some test data for our catalog in the form of a list of dictionaries.
books = [
    {'id': 0,
     'title': 'A Fire Upon the Deep',
     'author': 'Vernor Vinge',
     'first_sentence': 'The coldsleep itself was dreamless.',
     'year_published': '1992'},
    {'id': 1,
     'title': 'The Ones Who Walk Away From Omelas',
     'author': 'Ursula K. Le Guin',
     'first_sentence': 'With a clamor of bells that set the swallows soaring, the Festival of Summer came to the city Omelas, bright-towered by the sea.',
     'published': '1973'},
    {'id': 2,
     'title': 'Dhalgren',
     'author': 'Samuel R. Delany',
     'first_sentence': 'to wound the autumnal city.',
     'published': '1975'}
]


@app.route('/', methods=['GET'])
def home():
    return '''<h1>Internet analysis</h1>
<p>A prototype API for IP-layer datasets.</p>'''

@app.route('/api/v1/resources/traceroutes', methods=['GET'])
def traceroutes():
    # Check if an ID was provided as part of the URL.
    # If ID is provided, assign it to a variable.
    # If no ID is provided, display an error in the browser.
    #if 'id' in request.args:
    #    id = int(request.args['id'])
    #else:
    #    return "Error: No id field provided. Please specify an id."

    # Create an empty list for our results
    result = {"traceroutes": [
        {"ts": 1593196532,
         "source_address": "155.101.16.198",
         "target_address": "8.8.8.8",
         "data_source": {
             "name": "perfSONAR Esmond database",
             "hostname": "uofu-science-dmz-bandwidth.chpc.utah.edu"
         },
         "packets": [
             {"ip": "155.101.16.198",
              "ttl": 0,
              "rtt_ms": 0},
             {"ip": "155.101.16.1",
              "ttl": 1,
              "rtt_ms": 0.808}
         ]
        }
        ]
    }

    # Use the jsonify function from Flask to convert our list of
    # Python dictionaries to the JSON format.
    return jsonify(result)

app.run()
