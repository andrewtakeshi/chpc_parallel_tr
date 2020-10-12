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

    // Hide tables on reset.
    document.getElementById("current_run_table_area").style.visibility = "hidden";
    document.getElementById("netbeam_table_area").style.visibility = "hidden";
    // Clear tables on reset.
    document.getElementById("cr_table").getElementsByTagName('tbody')[0].innerHTML = "";
    document.getElementById("netbeam_table").getElementsByTagName("tbody")[0].innerHTML = "";



}

function addToCRTable(uuid)
{
    if (document.getElementById("esmond_ip_dest").value === "")
        return;

    document.getElementById("current_run_table_area").style.visibility = "visible";

    let numRows = document.getElementById('cr_table').rows.length - 1;
    let tbody = document.getElementById('cr_table').getElementsByTagName('tbody')[0];
    let cell_ids = ['type', 'source', 'dest', 'numRuns', 'status', 'selected']

    let row = tbody.insertRow();
    row.id = `${uuid}`;
    for (let i = 0; i < 6; i++)
    {
        row.insertCell(i);
        row.cells[i].id = `${uuid}_${cell_ids[i]}`
    }

    let source = document.getElementById("esmond_ip_source").value;
    let dest = document.getElementById("esmond_ip_dest").value;
    let type = source ? "pScheduler" : "System";
    let numRuns = document.getElementById("esmond_num_runs").value;


    row.cells[0].innerHTML = type;
    row.cells[1].innerHTML = source ? source : self.location.hostname;
    row.cells[2].innerHTML = dest;
    row.cells[3].innerHTML = numRuns;
    row.cells[4].innerHTML = "Pending"
    row.cells[5].style.textAlign = "center";
    row.cells[5].innerHTML = "<input type=\"checkbox\" checked=\"checked\">"
}

// document.addEventListener("DOMContentLoaded", function()
// {
//    document.getElementById("esmond_btn").addEventListener("click", addToCRTable);
//    document.getElementById("e2e_btn").addEventListener("click", addToCRTable);
// });

