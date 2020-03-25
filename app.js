require('dotenv').config();
const Airtable = require('airtable');
const { Client } = require('pg');
var async = require("async");

//setup airtable connection
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY,
}).base(process.env.AIRTABLE_BASE_ID);

//setup pg connecting, invisibly using env variables
const client = new Client({
  ssl: {
    rejectUnauthorized: false,
},
});

// var fs = require('fs');


var harvestProjectsSQL = 'SELECT hfc_harvest.projects.name AS project_name, hfc_harvest.projects.id AS project_id, hfc_harvest.projects.is_active AS is_active, hfc_harvest.clients.name AS client_name, hfc_harvest.clients.id AS client_id, hfc_harvest.projects.created_at, ROUND(CAST(SUM(te.total_cost) as numeric),2) AS total_cost, ROUND(CAST (SUM(te.total_billing) as numeric),2) AS total_billing FROM ( SELECT hours*cost_rate AS total_cost, hours*billable_rate AS total_billing, project_id FROM hfc_harvest.time_entries) AS te FULL JOIN hfc_harvest.projects ON projects.id = te.project_id JOIN hfc_harvest.clients ON projects.client_id = clients.id GROUP BY te.project_id, hfc_harvest.projects.name, hfc_harvest.clients.name, hfc_harvest.projects.created_at, hfc_harvest.projects.id, hfc_harvest.clients.id ORDER BY hfc_harvest.projects.created_at DESC';

var harvestClientsSQL = 'SELECT hfc_harvest.clients.name, hfc_harvest.clients.id AS client_id FROM hfc_harvest.clients ORDER BY hfc_harvest.clients.name ASC';

//TODO: prob a cleaner way to  declare all this stuff.

// harvest data from postgres
var harvestProjectsData = {};
var harvestClientsData = {};

var airtableUpdates = [];
var airtableUpdatesChunked = [];

var airtableClientUpdates = [];
var airtableClientUpdatesChunked = [];

var airtableCreates = [];
var airtableCreatesChunked = [];

var airtableClientCreates = [];
var airtableClientCreatesChunked = [];

// lookup table via nested arrays with Harvest IDs and Airtable IDs
var harvestAirtableLookup = [];
var harvestAirtableClientLookup = [];

//to make it easy to see if the value is present in Airtable
//store just the IDs in an array
var airtableProjectIdsPresent = [];
var airtableClientIdsPresent = [];

updateAll();

// TODO learn the right way to do the lifecycle stuff so that it happens in sequence...
async function updateAll() {
  client.connect();
  harvestClientsDataRefresh();
  setTimeout(updateClientAirtableRecords,10000);
  setTimeout(createClientAirtableRecords,20000);
  setTimeout(harvestProjectsDataRefresh,30000);
  setTimeout(updateAirtableRecords,40000);
  setTimeout(createAirtableRecords,50000);
  setTimeout(closeDbConnection,60000);
}

async function closeDbConnection() {
  client.end();
}

function delay(t, val) {
   return new Promise(function(resolve) {
       setTimeout(function() {
           resolve(val);
       }, t);
   });
};

//TODO: may be a way to share more code between the project and client processes

async function harvestProjectsDataRefresh() {
  //open db connection
  //QUERY POSTGRES FOR HARVEST DATA
  client.query(harvestProjectsSQL, function (err, result) {
    if (err) {
        console.log(err);
    }

    //... and store harvest data from PG as object
    harvestProjectsData = result.rows;
    console.log('Successfully stored Harvest Project Data!');


    //----
    //GET AIRTABLE
    //Get all the records already in Airtable and store locally

    console.log('Attempting to fetch Airtable Projects Data');

    base('Projects 2').select({
    view: "Grid view"
    }).eachPage(function page(records, fetchNextPage) {
        // This function (`page`) will get called for each page of records.

        records.forEach(function(record) {
            // console.log('Retrieved', record.get('project_id'));
            harvestAirtableLookup.push([
              record.get('project_id').toString(),
              record.getId().toString(),
            ]);
            airtableProjectIdsPresent.push(record.get('project_id').toString());
        });

        // To fetch the next page of records, call `fetchNextPage`.
        // If there are more records, `page` will get called again.
        // If there are no more records, `done` will get called.
        fetchNextPage();

    }, function done(err) {
        if (err) { console.error(err);
          return; } else {
            console.log(harvestAirtableLookup.length+' Airtable Projects Data Successfully Fetched!');
            console.log('Updating or Creating Records...')

            harvestProjectsData.forEach(function(row){

              // console.log('Looking for existing Airtable entry for project_id: '+row.project_id);

              if (airtableProjectIdsPresent.includes(row.project_id)) {
                // console.log('project_id found in Airtable! Adding to update list');

                var projectAirtableId = null;
                var clientAirtableId = null;

                // TODO: almost certainly a better way to write this so
                // TODO: would be nice to only update values that need updating
                //(e.g. check if airtable and harvest values match)
                async function projectAirtableLookups(arr1, arr2) {

                  // find airtable ID for project
                  for (var i = 0; i < arr1.length; i++) {
                    for (var j = 0; j < arr1[i].length; j++) {
                      if (arr1[i][j] == row.project_id) {
                        projectAirtableId = arr1[i][j+1];
                        // console.log('Airtable id found for project!')
                        // console.log('project_id: '+row.project_id+', airtable id: '+projectAirtableId);
                      }
                    }
                  }
                  //find airtable ID fo client
                  for (var i = 0; i < arr2.length; i++) {
                    for (var j = 0; j < arr2[i].length; j++) {
                      if (arr2[i][j] == row.client_id) {
                        clientAirtableId = arr2[i][j+1];
                        clientAirtableIdArray = [];
                        clientAirtableIdArray.push(clientAirtableId);

                      //   console.log('Airtable id found for client in project!')
                      //   console.log('client_id: '+row.client_id+', airtable id: '+clientAirtableId);
                      //   console.log(clientAirtableIdArray);
                      }
                    }
                  }
                  //add project data to array for updates
                  airtableUpdates.push({
                    "id": projectAirtableId,
                    "fields": {
                      "Project Name": row.project_name,
                      "Client Name": [clientAirtableId],
                      "Is Active?": row.is_active,
                      "client_id": String(row.client_id),
                      "total_cost": parseFloat(row.total_cost),
                      "total_billing": parseFloat(row.total_billing)
                    }
                  });
                }
                projectAirtableLookups(harvestAirtableLookup,harvestAirtableClientLookup);

              } else {
                console.log('Project not found in Airtable. Adding to create list.');
                airtableCreates.push({
                  "fields": {
                    "project_id": String(row.project_id),
                    "client_id": String(row.client_id),
                    "Client Name": row.client_name,
                    "Is Active?": row.is_active,
                    "Project Name": row.project_name,
                    "total_cost": parseFloat(row.total_cost),
                    "total_billing": parseFloat(row.total_billing)
                  }
                })
              }
            });
          }
    });
  })
};

async function updateAirtableRecords(){
  if (airtableUpdates.length == 0) {
    return

    } else {
      console.log('Initiating Airtable Updates for '+airtableUpdates.length+ ' records...');

      console.log('Preparing to chunk array for Updated Airtable Records...');
      var size = 10;
      for (var i=0; i<airtableUpdates.length; i+=size) {

           airtableUpdatesChunked.push(airtableUpdates.slice(i,i+size));
      }
      console.log('Chunked array created with '+airtableUpdatesChunked.length+' chunks.');

      for (var i=0; i<airtableUpdatesChunked.length; i++) {
        console.log('Preparing to update records for chunk '+ (i+1) +' of '+airtableUpdatesChunked.length);
          base('Projects 2').update(airtableUpdatesChunked[i], function(err, records) {
            if (err) {
              console.error(err);
              return
            }
            records.forEach(function(record) {
              console.log(record.get('project_id'));
            });
          })
        // Airtable API allows only 5 calls per second
        await delay(200);
      }
    }
};

async function createAirtableRecords() {
  if (airtableCreates.length == 0) {
    console.log('No new Project records to create.');
    return
    } else {
      console.log('Initiating Creation of new Airtable Records for '+airtableCreates.length+ ' projects...');

      console.log('Preparing to chunk array for new Airtable Records...');
      var size = 10;
      for (var i=0; i<airtableCreates.length; i+=size) {
           airtableCreatesChunked.push(airtableCreates.slice(i,i+size));
      }
      console.log('Chunked array created with '+airtableCreatesChunked.length+' chunks.');


      for (var i=0; i<airtableCreatesChunked.length; i++) {
        console.log('Preparing to post new record for chunk '+ (i+1) +' of '+airtableCreatesChunked.length);

        base('Projects 2').create(airtableCreatesChunked[i], function(err, records) {
          if (err) {
            console.error(err);
            return;
          }
          records.forEach(function (record) {
            console.log('project created in airtable with airtable id '+record.getId());
          });
        });
        await delay(200);
      }
    }
};

function harvestClientsDataRefresh() {

  //QUERY POSTGRES FOR HARVEST DATA
  client.query(harvestClientsSQL, function (err, result) {
    if (err) {
        console.log(err);
    }

    //... and store harvest data from PG as object
    harvestClientsData = result.rows;
    console.log('Successfully stored Harvest Client Data!');


    //----
    //GET AIRTABLE
    //Get all the records already in Airtable and store locally

    console.log('Attempting to fetch Airtable Client Data');

    base('Clients 2').select({
    view: "Grid view"
    }).eachPage(function page(records, fetchNextPage) {
        // This function (`page`) will get called for each page of records.

        records.forEach(function(record) {
            // console.log('Retrieved', record.get('client_id'));
            harvestAirtableClientLookup.push([
              record.get('client_id').toString(),
              record.getId().toString(),
            ]);
            airtableClientIdsPresent.push(record.get('client_id').toString());
        });

        // To fetch the next page of records, call `fetchNextPage`.
        // If there are more records, `page` will get called again.
        // If there are no more records, `done` will get called.
        fetchNextPage();

    }, function done(err) {
        if (err) { console.error(err);
          return; } else {
            console.log(harvestAirtableClientLookup.length+' Airtable Clients Data Successfully Fetched!');
            console.log('Updating or Creating Records...')

            harvestClientsData.forEach(function(row){

              if (airtableClientIdsPresent.includes(row.client_id)) {
                // console.log('client_id found in Airtable! Adding to update list');

                var clientAirtableId = null;

                function lookupAirtableId(arr) {
                  for (var i = 0; i < arr.length; i++) {
                    for (var j = 0; j < arr[i].length; j++) {
                      if (arr[i][j] == row.client_id) {
                        clientAirtableId = arr[i][j+1];
                        // console.log('Airtable id found for client!')
                        // console.log('client_id: '+row.client_id+', airtable id: '+clientAirtableId);
                      }
                    }
                  } airtableClientUpdates.push({
                    "id": clientAirtableId,
                    "fields": {
                      "Name": row.name,
                      "client_id": String(row.client_id)
                    }
                  });
                  return
                }

                lookupAirtableId(harvestAirtableClientLookup);


              } else {
                console.log('Client not found in Airtable. Adding to create list.');
                airtableClientCreates.push({
                  "fields": {
                    "Name": row.name,
                    "client_id": String(row.client_id)
                  }
                })
              }

            });
          }
    });
  })
};

async function updateClientAirtableRecords(){
  if (airtableClientUpdates.length == 0) {
    console.log('No Client records to update.');
    return

    } else {
      console.log('Initiating Airtable Updates for '+airtableClientUpdates.length+ ' client records...');

      console.log('Preparing to chunk array for Updated Airtable Client Records...');
      var size = 10;
      for (var i=0; i<airtableClientUpdates.length; i+=size) {

           airtableClientUpdatesChunked.push(airtableClientUpdates.slice(i,i+size));
      }
      console.log('Chunked array created with '+airtableClientUpdatesChunked.length+' chunks.');

      for (var i=0; i<airtableClientUpdatesChunked.length; i++) {
        console.log('Preparing to update client records for chunk '+ (i+1) +' of '+airtableClientUpdatesChunked.length);
          base('Clients 2').update(airtableClientUpdatesChunked[i], function(err, records) {
            if (err) {
              console.error(err);
              return
            }
            records.forEach(function(record) {
              console.log(record.get('client_id'));
            });
          })
        await delay(200);
      }
    }
};

async function createClientAirtableRecords() {
  if (airtableClientCreates.length == 0) {
    console.log('No new client records to create.');
    return
    } else {
      console.log('Initiating Creation of new Airtable Records for '+airtableClientCreates.length+ ' clients...');

      console.log('Preparing to chunk array for new Airtable Records...');
      var size = 10;
      for (var i=0; i<airtableClientCreates.length; i+=size) {

           airtableClientCreatesChunked.push(airtableClientCreates.slice(i,i+size));
      }
      console.log('Chunked array created with '+airtableClientCreatesChunked.length+' chunks.');


      for (var i=0; i<airtableClientCreatesChunked.length; i++) {
        console.log('Preparing to post new record for chunk '+ (i+1) +' of '+airtableClientCreatesChunked.length);
        base('Clients 2').create(airtableClientCreatesChunked[i], function(err, records) {
          if (err) {
            console.error(err);
            return;
          }
          records.forEach(function (record) {
            console.log('client created in airtable with airtable id '+record.getId());
          });
        });
        await delay(200);
      }
    }
};
