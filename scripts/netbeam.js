function normalizeUTCTime(inDate)
{
    let x = new Date(inDate);
    return `${x.getMonth() + 1}/${x.getDate()}/${x.getFullYear()} ${x.getHours()}:${("0" + x.getMinutes()).substr(-2)}:${("0" + x.getSeconds()).substr(-2)}`
}

function netbeamTest(resultType)
{
    let url = 'https://netbeam.es.net/api/network/esnet/prod/'
    let resource = document.getElementById("resource_name").value;
    let end = new Date().getTime();
    let begin = end - (15 * 60 * 1000);
    let requestStr = `${url}${resource}/${resultType}?begin=${begin}&end=${end}`;

    let req = new XMLHttpRequest();

    req.onreadystatechange = function()
    {
        let writeArea = document.getElementById("test_results");

        if (this.readyState == 4 && this.status == 200)
        {
            let returned = JSON.parse(this.responseText);
            let html = "<table class=\"table table-bordered\">" +
                "<thead class=\"thead-light\"><tr>" +
                "<th>Time</th><th>In</th><th>Out</th>" +
                "</tr></thead><tbody>";

            for (let i = 0; i < returned.points.length; i++)
            {
                let time = returned.points[i][0] == null ? 0 : returned.points[i][0];
                let inV = returned.points[i][1] == null ? 0 : returned.points[i][1];
                let outV = returned.points[i][2] == null ? 0 : returned.points[i][2];
                html += `<tr><td>${normalizeUTCTime(time)}</td><td>${inV}</td><td>${outV}</td></tr>`;
            }

            html += "</tbody></table>";

            writeArea.innerHTML = html;
        }
        else if (this.readyState == 4 && this.status != 200)
        {
            writeArea.innerHTML = "Error loading API results."
        }
        else
        {
            writeArea.innerHTML = "Loading results."
        }
    }

    req.open("GET", requestStr, true);
    req.send();
}

function btnToggle()
{
    let btns = $("[name='netbeam_btn']");
    for (let i = 0; i < btns.length; i++)
    {
        btns[i].disabled = false;
    }

}