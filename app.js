require('dotenv').config()

const express = require('express');
const { Client } = require('pg');

//setup airtable connection
Airtable.configure({ apiKey: process.env.AIRTABLE_API_KEY })
//specify Airtable Base
const base = require('airtable').base('app9FcC13zUdYzkKC');

//setup pg connecting, invisibly using env variables
const client = new Client({
  ssl: true
});

var fs = require('fs');


client.connect();
var app = express();
app.set('port', process.env.PORT || 4000);
app.get('/', function (req, res, next) {
      client.query('SELECT hfc_harvest.projects.name AS project_name, hfc_harvest.projects.id AS project_id, hfc_harvest.clients.name AS client_name, hfc_harvest.projects.created_at, ROUND(CAST(SUM(te.total_cost) as numeric),2) AS total_cost, ROUND(CAST (SUM(te.total_billing) as numeric),2) AS total_billing FROM ( SELECT hours*cost_rate AS total_cost, hours*billable_rate AS total_billing, project_id FROM hfc_harvest.time_entries) AS te FULL JOIN hfc_harvest.projects ON projects.id = te.project_id JOIN hfc_harvest.clients ON projects.client_id = clients.id GROUP BY te.project_id, hfc_harvest.projects.name, hfc_harvest.clients.name, hfc_harvest.projects.created_at, hfc_harvest.projects.id ORDER BY hfc_harvest.projects.created_at DESC', function (err, result) {
        if (err) {
            console.log(err);
            res.status(400).send(err);
        }
        res.status(200).send(result.rows);
    });
});
app.listen(4000, function () {
    console.log('Server is running.. on Port 4000');
});
