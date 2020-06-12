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

