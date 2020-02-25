#!/usr/bin/bash

# PLACEHOLDER VALUES - these should be dynamically set according to user's transfer parameters
#    For globus, this probably means calling `globus endpoint server list $ep_id` with a provided endpoint id.
ep_source="204.99.128.105"  # (UofU) dtn01-dmz.chpc.utah.edu
ep_dest="192.5.159.2"       # (PSU)  dtn.scidmz.psu.edu

log_info() { printf "[INFO] %s\n" "$*" >&2; }

encode_augmented_traceroute_url() {
    # Requires $traceroute, $ts_start, $ts_end
    base_url="https://snapp-portal.grnoc.iu.edu/grafana/dashboard/script/atr.js"
    orgId=2
    raw=$(echo -en "${traceroute}" | xxd -plain | tr -d '\n' | sed 's/\(..\)/%\1/g')
    url_augtr="${base_url}?orgId=${orgId}&raw=${raw}&from=${ts_start}&to=${ts_end}"
    return 0;
}

standardize_ps_trace_output_awk="/^[0-9]+\s+[a-zA-Z0-9]/ {
    if (\$2 == \"No\" && \$3 == \"Response\") {
        printf \"%2d  *\n\", \$1;
    }
    else {
        if (\$3 ~ /\(([0-9]{1,3}\.){3}[0-9]{1,3}\)/) {
            ipv4addr=substr(\$3,2,length(\$3)-2);
            hostname=\$2;
            rtt=\$5;
        }
        else {
            ipv4addr=\$2;
            hostname=ipv4addr;
            rtt=\$4;
        }
        printf \"%2d  %s (%s)  %.3f ms\n\", \$1, hostname, ipv4addr, rtt;
    }
}"

generate_html_email() {
  echo "<!doctype html>
 <html>
   <head>
     <meta name=\"viewport\" content=\"width=device-width\">
     <meta http-equiv=\"Content-Type\" content=\"text/html; charset=UTF-8\">
     <title>Data transfer report</title>
     <style>
     @media only screen and (max-width: 620px) {
       table[class=body] h1 {
         font-size: 28px !important;
         margin-bottom: 10px !important;
       }
       table[class=body] p,
             table[class=body] ul,
             table[class=body] ol,
             table[class=body] td,
             table[class=body] span,
             table[class=body] a {
         font-size: 16px !important;
       }
       table[class=body] .wrapper,
             table[class=body] .article {
         padding: 10px !important;
       }
       table[class=body] .content {
         padding: 0 !important;
       }
       table[class=body] .container {
         padding: 0 !important;
         width: 100% !important;
       }
       table[class=body] .main {
         border-left-width: 0 !important;
         border-radius: 0 !important;
         border-right-width: 0 !important;
       }
       table[class=body] .btn table {
         width: 100% !important;
       }
       table[class=body] .btn a {
         width: 100% !important;
       }
       table[class=body] .img-responsive {
         height: auto !important;
         max-width: 100% !important;
         width: auto !important;
       }
     }
    /* -------------------------------------
         PRESERVE THESE STYLES IN THE HEAD
     ------------------------------------- */
     @media all {
       .ExternalClass {
         width: 100%;
       }
       .ExternalClass,
             .ExternalClass p,
             .ExternalClass span,
             .ExternalClass font,
             .ExternalClass td,
             .ExternalClass div {
         line-height: 100%;
       }
       #MessageViewBody a {
         color: inherit;
         text-decoration: none;
         font-size: inherit;
         font-family: inherit;
         font-weight: inherit;
         line-height: inherit;
       }
       .btn-primary table td:hover {
         background-color: #34495e !important;
       }
       .btn-primary a:hover {
         background-color: #34495e !important;
         border-color: #34495e !important;
       }
     }
     </style>
   </head>"

echo "  <body class=\"\" style=\"background-color: #f6f6f6; font-family: sans-serif; -webkit-font-smoothing: antialiased; font-size: 14px; line-height: 1.4; margin:   0; padding: 0; -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%;\">
     <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" class=\"body\" style=\"border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width:     100%; background-color: #f6f6f6;\">
       <tr>
         <td style=\"font-family: sans-serif; font-size: 14px; vertical-align: top;\">&nbsp;</td>
         <td class=\"container\" style=\"font-family: sans-serif; font-size: 14px; vertical-align: top; display: block; Margin: 0 auto; max-width: 900px;         padding: 10px; width: 900px;\">
           <div class=\"content\" style=\"box-sizing: border-box; display: block; Margin: 0 auto; max-width: 900px; padding: 10px;\">

             <!-- START CENTERED WHITE CONTAINER -->
             <table class=\"main\" style=\"border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width: 100%; background: #ffffff; border-     radius: 3px;\">

               <!-- START MAIN CONTENT AREA -->
               <tr>
                 <td class=\"wrapper\" style=\"font-family: sans-serif; font-size: 14px; vertical-align: top; box-sizing: border-box; padding: 20px;\">
                   <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width:    100%;\">
                     <tr>
                       <td style=\"font-family: sans-serif; font-size: 14px; vertical-align: top;\">"
echo "<p style=\"font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; Margin-bottom: 15px;\"><b>Transfer command:</b>  <code>${cmd}</code></p>"
echo "<p style=\"font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; Margin-bottom: 15px;\"><b>Transfer status:</b>  <code>${transfer_status}</code> ${transfer_link}</p>"
echo "<p style=\"font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; Margin-bottom: 15px;\"><b>Start:</b>  ${date_start}</p>"
echo "<p style=\"font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; Margin-bottom: 15px;\"><b>End:  </b>  ${date_end}</p>"
echo "<p style=\"font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; Margin-bottom: 15px;\"><b>Source address:</b>  ${ep_source}</p>"
echo "<p style=\"font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; Margin-bottom: 15px;\"><b>Destination address:</b>  ${ep_dest}</p>"
echo "                        <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" class=\"btn btn-primary\" style=\"border-collapse: separate; mso-table-lspace: 0pt;    mso-table-rspace: 0pt; width: 100%; box-sizing: border-box;\">
                           <tbody>
                             <tr>
                               <td align=\"left\" style=\"font-family: sans-serif; font-size: 14px; vertical-align: top; padding-bottom: 15px;\">
                                 <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace:  0pt; width: auto;\">
                                   <tbody>
                                     <tr>
                                       <td style=\"font-family: sans-serif; font-size: 14px; vertical-align: top; background-color: #3498db; border-radius:     5px; text-align: center;\"> <a href=\"${url_augtr}\" target=\"_blank\" style=\"display: inline-block; color: #ffffff; background-color: #3498db; border:     solid 1px #3498db; border-radius: 5px; box-sizing: border-box; cursor: pointer; text-decoration: none; font-size: 14px; font-weight: bold; margin: 0;         padding: 12px 25px; text-transform:
                                               capitalize; border-color: #3498db;\">Click here for your GlobalNOC Augmented Traceroute</a> </td>
                                     </tr>
                                   </tbody>
                                 </table>
                               </td>
                             </tr>
                           </tbody>
                         </table>"

echo "<table style=\"background-color: rgb(255,255,255); text-align:center; border-collapse: collapse;\">"
echo "<tr>"
echo "<td colspan=2 style=\"background-color: rgba(255,255,255,0); border: 0px; padding: 5px 5px\"></td>"
echo "<th style=\"border: 1px solid rgb(190,190,190); padding: 5px 5px\">Throughput</th>"
echo "</tr>"
echo "<tr>"
echo "<th rowspan=2 style=\"border: 1px solid rgb(190,190,190); padding: 5px 5px;\">iperf3 Test</th>"
echo "<th style=\"border: 1px solid rgb(190,190,190); padding: 5px 5px;\">Source &rarr; Dest</th>"
echo "$ps_throughput" | awk '/^Summary$/ {getline;getline;if ($6 > 0) color="red"; else color="green"; printf "<td style=\"border: 1px solid rgb(190,190,190); padding: 5px 5px\">%0.2f %s <font color="color">(%s retransmits)</font></td>\n",$4,$5,$6}'
echo "</tr>"
echo "<tr>"
echo "<th style=\"border: 1px solid rgb(190,190,190); padding: 5px 5px;\">Dest &rarr; Source</th>"
echo "$ps_throughput_reverse" | awk '/^Summary$/ {getline;getline;if ($6 > 0) color="red"; else color="green"; printf "<td style=\"border: 1px solid rgb(190,190,190); padding: 5px 5px\">%0.2f %s <font color="color">(%s retransmits)</font></td>\n",$4,$5,$6}'
echo "</tr>"
echo "<tr>"
echo "<th colspan=2 style=\"border: 1px solid rgb(190,190,190); padding: 5px 5px\">Your Transfer</th>"
echo "<td style=\"border: 1px solid rgb(190,190,190); padding: 5px 5px\">${transfer_throughput} B/s (${transfer_bytes} B Total)</td>"
echo "</tr>"
echo "</table>"

echo "<br />"

echo -e "$ps_trace\n$ps_trace_end\n$ps_trace_reverse\n$ps_trace_reverse_end" | awk -f traceroutes-to-html-tablerows.awk

echo "                       </td>
                     </tr>
                   </table>
                 </td>
               </tr>

             <!-- END MAIN CONTENT AREA -->
             </table>

             <!-- START FOOTER -->
             <div class=\"footer\" style=\"clear: both; Margin-top: 10px; text-align: center; width: 100%;\">
               <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width: 100%;  \">
                 <tr>
                   <td class=\"content-block\" style=\"font-family: sans-serif; vertical-align: top; padding-bottom: 10px; padding-top: 10px; font-size: 12px;    color: #999999; text-align: center;\">
                       <br>The Augmented Traceroute feature is supported by the <a href=\"https://globalnoc.iu.edu/\" style=\"text-decoration: underline; color:  #999999; font-size: 12px; text-align: center;\">GlobalNOC</a> at Indiana University.
                   </td>
                 </tr>
               </table>
             </div>
             <!-- END FOOTER -->
                        <!-- END CENTERED WHITE CONTAINER -->
           </div>
         </td>
         <td style=\"font-family: sans-serif; font-size: 14px; vertical-align: top;\">&nbsp;</td>
       </tr>
     </table>
   </body>
 </html>"
}

# BEGIN USER PROMPTS
echo "Enter a valid hostname or IP address for the transfer source (leave blank for local machine)"
echo -n "Source address: "
read ep_source
if [ -z $ep_source ]
then
    ep_source=$(hostname)
fi
#log_info "Got source address: ${ep_source}"

echo "Enter a valid hostname or IP address for the transfer destination (leave blank for local machine)"
echo -n "Destination address: "
read ep_dest
if [ -z $ep_dest ]
then
    ep_dest=$(hostname)
fi
#log_info "Got destination address: ${ep_source}"

echo "Enter the email address where you want to recieve transfer diagnostics."
echo -n "Email address: "
read email
#log_info "Got user email address: ${email}"

echo "Paste or enter your transfer command, then press <Enter> followed by a Ctrl-D (i.e. EOF)."
echo -n "Transfer command: "
set -- $(</dev/stdin)
cmd="$@"
#log_info "Got user's transfer command: $@"
# END USER PROMPTS

echo -e "\nSource:\t${ep_source} (PING $((ping -c1 ${ep_source} > /dev/null 2>&1) && echo \\e[32mOK\\e[39m || echo \\e[31mFAILED\\e[39m))" #"
echo -e "Dest:\t${ep_dest} (PING $((ping -c1 ${ep_dest} > /dev/null 2>&1) && echo \\e[32mOK\\e[39m || echo \\e[31mFAILED\\e[39m))" #"
echo -e "Email:\t${email}"
echo -e "Cmd:\t$@"
echo -n "Is this correct? [y/n] "
read confirmation
if [ ${confirmation:0:1} != "y" ]
then
    log_info "Aborting..."
    exit
fi

# BEGIN PRE-SCRIPT

log_info "Scheduling a traceroute from ${ep_source} to ${ep_dest}"
ps_trace=$(pscheduler task trace --source=${ep_source} --dest=${ep_dest})

log_info "Converting perfSONAR output to standard traceroute output"
traceroute=$(awk "${standardize_ps_trace_output_awk}" <<< "${ps_trace}")

log_info "Scheduling a (reverse) traceroute from ${ep_dest} to ${ep_source}"
ps_trace_reverse=$(pscheduler task trace --source=${ep_dest} --dest=${ep_source})

log_info "Scheduling an iperf3 throughput test from ${ep_source} to ${ep_dest}"
ps_throughput=$(pscheduler task --tool=iperf3 throughput --source=${ep_source} --dest=${ep_dest})

log_info "Scheduling an iperf3 (reverse) throughput test from ${ep_dest} to ${ep_source}"
ps_throughput_reverse=$(pscheduler task --tool=iperf3 throughput --source=${ep_dest} --dest=${ep_source})

log_info "Recording transfer starting epoch time (ms)"
ts_start=$(date +%s%3N)
date_start=$(date)
# END PRE-SCRIPT

# BEGIN DATA TRANSFER
# Start the data transfer
log_info "Running the user's command: $@"
output=$(eval $@)
ret=$?

trace_task=$(pscheduler task --url --repeat=PT1M trace --source=${ep_source} --dest=${ep_dest})


if [[ $1 == "globus" ]] && [[ $2 == "transfer" ]]
then
    using_globus=1
    log_info "Detected a Globus transfer. Waiting for it to complete..."
    read task_id <<< $(echo "$output" | awk '/^Task ID:/ {print $3}')
    globus task wait ${task_id}
    read transfer_status transfer_bytes transfer_throughput <<< $(globus task show ${task_id} | awk '/^Status:/ {printf "%s ",$2} /^Bytes Transferred:/ {printf "%s ",$3} /^Bytes Per Second:/ {print $4}')
    transfer_link="(<a href='https://app.globus.org/activity/${task_id}/overview' >Click here for your Globus transfer overview</a>)"
fi

if [ -z $transfer_status ]
then
    transfer_status="Transfer process returned ${ret}."
fi

if [ -z $transfer_bytes ]
then
    transfer_bytes="Unknown"
fi

if [ -z $transfer_throughput ]
then
    transfer_throughput="Unknown"
fi

pscheduler cancel ${trace_task}
# END DATA TRANSFER

# BEGIN POST-SCRIPT
log_info "Recording ending epoch time (ms)"
ts_end=$(date +%s%3N)
date_end=$(date)

log_info "Scheduling a final traceroute from ${ep_dest} to ${ep_source}"
ps_trace_end=$(pscheduler task trace --source=${ep_source} --dest=${ep_dest})

log_info "Scheduling a final (reverse) traceroute from ${ep_dest} to ${ep_source}"
ps_trace_reverse_end=$(pscheduler task trace --source=${ep_dest} --dest=${ep_source})

log_info "Encoding traceroute into IU Augmented Traceroute query URL"
encode_augmented_traceroute_url # Result stored in $url_augtr
#END POST-SCRIPT

log_info "Sending email report to ${email}."
generate_html_email | tee /tmp/augtr-email.html | mutt -e "set content_type=text/html" -s "Your perfSONAR transfer report" "${email}"

log_info "Finished; exiting."
