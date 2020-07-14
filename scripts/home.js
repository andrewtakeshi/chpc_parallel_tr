function formLogger(form)
{
    if (validate(form))
    {
        let text = "";
        for (let i = 0; i < form.length; i++) {
            if (form.elements[i].tagName != "BUTTON") {
                text += form.elements[i].name + ": " + form.elements[i].value + "\n";
            }
        }
        console.log(text);
    }
}

function validate(form)
{
    let accepted = true;
    for (let i = 0; i < form.length; i++)
    {
        if (form.elements[i].tagName == "INPUT")
        {

            let name = form.elements[i].id;
            let spanName = name + "_warn";
            if (form.elements[i].value == "")
            {
                accepted = false;
                document.getElementById(spanName).hidden = false;
            }
            else
            {
                document.getElementById(spanName).hidden = true;
            }
        }
    }

    return accepted;
}

function resetForms()
{
    let forms = $("form");
    for (let i = 0; i < forms.length; i++)
    {
        forms[i].reset();
    }

    let warnings = $("[name='warn']");
    for (let i = 0; i < warnings.length; i++)
    {
        warnings[i].hidden = true;
    }
}

function runTable()
{
    if (document.getElementById("esmond_ip_dest").value === "")
        return;

    document.getElementById("current_run_table_area").style.visibility = "visible";

    let row = document.getElementById("cr_table").insertRow();
    for (let i = 0; i < 6; i++)
    {
        row.insertCell(i);
    }

    let source = document.getElementById("esmond_ip_source").value;
    let dest = document.getElementById("esmond_ip_dest").value;
    let type = source ? "pScheduler" : "System";
    let numRuns = document.getElementById("esmond_num_runs").value;


    row.cells[0].innerHTML = type;
    row.cells[1].innerHTML = source ? source : "None";
    row.cells[2].innerHTML = dest;
    row.cells[3].innerHTML = numRuns;
    row.cells[4].innerHTML = "Running"
    row.cells[5].style.textAlign = "center";
    row.cells[5].innerHTML = "<input type=\"checkbox\" checked=\"checked\">"
}

document.addEventListener("DOMContentLoaded", function()
{
   document.getElementById("esmond_btn").addEventListener("click", runTable);
});

