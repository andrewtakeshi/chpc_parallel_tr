BEGIN {
    hop=0;
    idx=1;
    maxhops=1;
    }

function process_hop(line)
{
    split(line, a);
    if (a[1] < hop) {
        if (maxhops < hop) {  #Next route starting
            maxhops = hop;
            }
        hop=0;
        idx+=1;
        }
    hop=a[1];
    if (a[3] == "Response") {
        hopinfo = "<i>Unknown</i>";
    }
    else {
        ep=a[2];
        getline;
        if ($1 ~ /^[0-9]+/) {
            network="UNKNOWN";
            cache=$0;
        }
        else {
            network=$1;
            cache="";
        }
        hopinfo = "["network"]<br />"ep;
    }
    traceroutes[idx, hop] = hopinfo;
    if (cache != "") {
        process_hop(cache);
    }
}

/^[0-9]+\s+[a-zA-Z0-9]/ {
    process_hop($0);
}

END {
    if (maxhops < hop) {
        maxhops = hop;
        }
    print "<table style=\"background-color: rgb(255,255,255); text-align:center; border-collapse: collapse;\">";
    print "<tr>";
    print "<td colspan=2 style=\"background-color: rgba(255,255,255,0); border: 0px; padding: 5px 5px\">Route Analysis</td>";
    print "<th style=\"background-color: rgb(235,235,235); border: 1px solid rgb(190,190,190); padding: 5px 5px\">Pre-transfer</th>";
    print "<th style=\"background-color: rgb(255,255,255); border: 1px solid rgb(190,190,190); padding: 5px 5px\">Post-transfer</th>";
    print "<th style=\"background-color: rgb(235,235,235); border: 1px solid rgb(190,190,190); padding: 5px 5px\">Pre-transfer (Reverse)</th>";
    print "<th style=\"background-color: rgb(255,255,255); border: 1px solid rgb(190,190,190); padding: 5px 5px\">Post-transfer (Reverse)</th>";
    print "</tr>";
    for (i = 1; i <= maxhops; i++) {
        print "<tr>";
        if (i == 1)
            print "<th rowspan="maxhops" style=\"border: 1px solid rgb(190,190,190); padding: 5px 5px\">Traceroute Hops</th>";
        print "<td style=\"border: 1px solid rgb(190,190,190); padding: 5px 5px\">"i"</td>";
        for (j = 1; j <= 4; j++) {
            if (j % 2 == 0) {
                print "<td style=\"background-color: rgb(255,255,255); border: 1px solid rgb(190,190,190); padding: 5px 5px\">"traceroutes[j, i]"</td>";
            } else {
                print "<td style=\"background-color: rgb(235,235,235); border: 1px solid rgb(190,190,190); padding: 5px 5px\">"traceroutes[j, i]"</td>";
            }
        }
        print "</tr>";
    }
    print "</table>";
}
