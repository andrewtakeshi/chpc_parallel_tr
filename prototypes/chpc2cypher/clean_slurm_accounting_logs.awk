# Use SLURM `sacct` output delimiter
BEGIN {
	FS="|";
	OFS="|";
	
	# Column indices
	time_limit = 14
	slurm_nodelist = 15
}

# Convert time durations to Standard-compatible time intervals
$time_limit ~ /-/ {
	gsub(/-/, " ", $time_limit);
}

# Decompress the SLURM nodelist if necessary
$slurm_nodelist ~ /\[/ {
	uncompressed = "";
	nodelist = $slurm_nodelist
	# Look for compressed elements
	while (match(nodelist, /([a-zA-Z]+\[[0-9,-]+\])/)) {
		subset = substr(nodelist, RSTART, RLENGTH);
		nodelist = substr(nodelist, RSTART+RLENGTH);

		# Extract prefix and ranges
		match(subset, /([^\[]+)/);
		prefix = substr(subset, RSTART, RLENGTH);
		subset = substr(subset, RSTART+RLENGTH+1, length(subset)-RLENGTH-2);
		split(subset, ranges, ",");

		# Decompress the ranges and append the individual hostnames to the output
		for (i in ranges) {
			if (ranges[i] ~ /-/) {
				split(ranges[i], range, "-");
				for (j = 0+range[1]; j <= 0+range[2]; j++) {
					uncompressed = uncompressed "," prefix sprintf("%0"(length(range[1]))"d", j);
				}
			}
			else {
				uncompressed = uncompressed "," prefix ranges[i];
			}
		}
	}
	
	# Look for uncompressed elements and append to output
	while (match($slurm_nodelist, /([a-zA-Z]+[0-9]+)/)) {
		node = substr($slurm_nodelist, RSTART, RLENGTH);
		$slurm_nodelist = substr($slurm_nodelist, RSTART+RLENGTH);
		uncompressed = uncompressed "," node;
	}

	# Replace the nodelist with the uncompressed version, minus leading comma
	$slurm_nodelist = substr(uncompressed, 2);
}

{ print };
