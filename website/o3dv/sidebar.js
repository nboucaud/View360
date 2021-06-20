OV.Sidebar = class
{
    constructor (parentDiv)
    {
        this.parentDiv = parentDiv;
        this.callbacks = null;
        this.visible = true;
        this.titleDiv = null;
        this.contentDiv = null;

    }

    Init (callbacks)
    {
        this.callbacks = callbacks;
        this.titleDiv = $('<div>').addClass ('ov_sidebar_title').appendTo (this.parentDiv);
        this.contentDiv = $('<div>').addClass ('ov_sidebar_content').addClass ('ov_thin_scrollbar').appendTo (this.parentDiv);
        let titleTextDiv = $('<div>').addClass ('ov_sidebar_title_text').html ('Details').appendTo (this.titleDiv);
        let titleImg = $('<img>').addClass ('ov_sidebar_title_img').attr ('src', 'assets/images/sidebar/close.svg').appendTo (this.titleDiv);
        let obj = this;
        titleImg.click (function () {
            obj.callbacks.onClose ();
        });
    }

    Show (show)
    {
        this.visible = show;
        if (this.visible) {
            this.parentDiv.show ();
        } else {
            this.parentDiv.hide ();
        }
    }

    IsVisible ()
    {
        return this.visible;
    }

    AddProperties (properties)
    {
        function AddProperty (table, property)
        {
            let row = $('<tr>').appendTo (table);
            let nameColum = $('<td>').addClass ('ov_property_table_name').appendTo (row);
            let valueColumn = $('<td>').addClass ('ov_property_table_value').appendTo (row);
            nameColum.html (property.name).attr ('title', property.name);
            let valueText = null;
            if (property.type === OV.PropertyType.Integer) {
                valueText = property.value.toLocaleString ();
            } else if (property.type === OV.PropertyType.Percent) {
                valueText = parseInt (property.value * 100, 10).toString () + '%';
            } else if (property.type === OV.PropertyType.Color) {
                valueText = '#' + OV.ColorToHexString (property.value);
            }
            if (valueText !== null) {
                valueColumn.html (valueText).attr ('title', valueText);
            }
        }

        this.Clear ();
        let table = $('<table>').addClass ('ov_property_table').appendTo (this.contentDiv);
        for (let i = 0; i < properties.length; i++) {
            let property = properties[i];
            AddProperty (table, property);
        }

        this.Resize ();
    }

    AddElementProperties (element)
    {
        let properties = [];
        properties.push (new OV.Property (OV.PropertyType.Integer, 'Vertex Count', element.VertexCount ()));
        properties.push (new OV.Property (OV.PropertyType.Integer, 'Triangle Count', element.TriangleCount ()));
        this.AddProperties (properties);
    }

    AddMaterialProperties (material)
    {
        let properties = [];
        properties.push (new OV.Property (OV.PropertyType.Color, 'Color', material.diffuse));
        properties.push (new OV.Property (OV.PropertyType.Percent, 'Opacity', material.opacity));
        this.AddProperties (properties);
    }    

    Resize ()
    {
        let titleHeight = this.titleDiv.outerHeight (true);
        let height = this.parentDiv.height ();
        this.contentDiv.outerHeight (height - titleHeight, true);
    }

    Clear ()
    {
        this.contentDiv.empty ();
    }
};
