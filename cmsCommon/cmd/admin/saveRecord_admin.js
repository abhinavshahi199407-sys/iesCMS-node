// cmsCommon/cmd/admin/editlistSaveRecord_admin.js
// API Endpoint: POST /runcmd  { cmd:"admin/saveRecord", eclass:"...", id:"...", fld*:"..." }
//
// Saves one record to the database table defined by the eclass config.
//   id="*new*"  → INSERT (DB generates primary key via bigserial/RETURNING)
//   id=<value>  → UPDATE WHERE primaryKey = id
//
// Form fields arrive as fld<FieldName>=<value> (serialized by jQuery from #editobjform).
// Only fields declared in EditFields config are written — unknown POST keys are ignored.
//
// FUTURE: implement Delete/Remove as a separate cmd → admin/editlist-delete
//
// Test: POST /runcmd { cmd:"admin/editlist-save", eclass:"edit-members", id:"*new*",
//         fldUserName:"Test User", fldStatus:"Active", fldSiteID:"k4k" }

module.exports = {
    id: 'admin/saveRecord',
    auth: 'admin',
    params: [
        { name: 'eclass', description: 'Edit-class name (e.g. edit-members). Resolves to eclass-<name>.cfg' },
        { name: 'id',     description: 'Primary key value of the record, or "*new*" to insert' },
        // Additional fld<FieldName>=<value> pairs arrive from jQuery form serialization
    ],
    handler: async (cms) => {
        const body = cms.body || {};
        const setError = (msg) => { cms.ReturnJson = { success: false, error: msg }; };

        // 1. Load eclass config
        const eclass = (body.eclass || cms.FormOrUrlParam('eclass', '')).trim().toLowerCase();
        if (!eclass) { return setError('Missing eclass parameter [err-els-001]'); }

        cms.LoadEditListIfNeeded(eclass);
        if (cms.editlisterror) {
            cms.logError('admin/editlist-save: ' + cms.editlisterror);
            return setError(cms.editlisterror);
        }

        const ej         = cms.editlistj;
        const table      = ej.getStr('Table');
        const primaryKey = ej.getStr('PrimaryKey');
        const pkNumeric        = ej.getBool('PrimaryKeyNumeric', false);
        const userEntersNewKey = ej.getBool('UserEntersNewKey', true); // false = DB generates PK on INSERT (bigserial)
        const noWorldId        = ej.getStr('SpecialFlags').toLowerCase().indexOf('noworldid') >= 0;

        if (!table)      { return setError('eclass config missing Table [err-els-002]'); }
        if (!primaryKey) { return setError('eclass config missing PrimaryKey [err-els-002]'); }

        // 2. Determine INSERT vs UPDATE
        const id  = ('' + (body.id || '')).trim();
        if (!id)  { return setError('Missing id parameter [err-els-003]'); }
        const isNew = (id.toLowerCase() === '*new*');

        // 3. Collect field values — only fields declared in EditFields are written
        const editFieldsArr = ej.i('EditFields').toJsonArray(); // array of FlexJson field objects
        const overrideObj   = ej.i('Override');
        const fieldNames    = [];
        const fieldValues   = [];
        const jsonFields    = {}; // fields with Flags:e — packed into extra JSONB column

        if (!editFieldsArr) { return setError('EditFields missing or empty in eclass config [err-els-004]'); }

        for (const fldDef of editFieldsArr) {
            const fieldName = fldDef.getStr('Field').replace(/`/g, '').trim();
            const flags     = fldDef.getStr('Flags').toLowerCase();

            if (!fieldName) { continue; }
            if (flags.indexOf('p') >= 0) { continue; } // primary key — handled by id, not written as a field
            if (isNew && !userEntersNewKey && fieldName.toLowerCase() === primaryKey.toLowerCase()) { continue; } // DB generates PK on INSERT

            // FUTURE: enforce Flags:r (readonly) server-side — currently trusting the front-end
            // if (flags.indexOf('r') >= 0) { continue; }

            const bodyKey = 'fld' + fieldName;
            if (!(bodyKey in body)) { continue; } // field not submitted — skip

            let val = body[bodyKey];

            // Apply Override — force the value regardless of what was submitted
            // getStr returns the sentinel '\x00' when the key does not exist in Override
            const overrideVal = overrideObj.getStr(fieldName, '\x00');
            if (overrideVal !== '\x00') { val = overrideVal; }

            // Password fields: hash non-empty values; skip empty (preserves existing password on edit)
            const fieldType = fldDef.getStr('Type').toLowerCase();
            if (fieldType === 'password') {
                if (!val || val.trim() === '') { continue; } // blank → don't overwrite existing password
                val = cms._hashPassword(val.trim()); // scrypt hash with random salt → $1$<salt>$<hash>
            }

            // On INSERT, skip blank values so DB column defaults apply — '' is not
            // valid for numeric columns (e.g. users.userLevel int NOT NULL DEFAULT 0)
            if (isNew && (val === undefined || val === null || ('' + val).trim() === '')) { continue; }

            // Flags:e — field lives in extra JSONB column, not a real table column
            if (flags.indexOf('e') >= 0) {
                jsonFields[fieldName] = val;
                continue;
            }

            fieldNames.push(fieldName);
            fieldValues.push(val);
        }

        if (fieldNames.length === 0) { return setError('No writable fields found in submission [err-els-005]'); }

        // 4. Build and execute SQL
        try {
            await cms.db.Open();
            let savedId = null;

            // Merge extra JSONB fields into the regular col/val lists (INSERT) or SET clause (UPDATE)
            const hasExtra = Object.keys(jsonFields).length > 0;

            if (isNew) {
                // INSERT — primary key is bigserial, generated by the database
                if (hasExtra) { fieldNames.push('extra'); fieldValues.push(JSON.stringify(jsonFields)); }
                const colList = fieldNames.join(', ');
                const valList = fieldValues.map(v => cms.db.dbStr(v)).join(', ');
                const sql = `INSERT INTO ${table} (${colList}) VALUES (${valList}) RETURNING ${primaryKey}`;
                const result = await cms.db.ExecuteSQL(sql);
                savedId = result && result.rows && result.rows[0] ? result.rows[0][primaryKey.toLowerCase()] : null;
            } else {
                // UPDATE
                let setPairs = fieldNames.map((f, i) => f + ' = ' + cms.db.dbStr(fieldValues[i])).join(', ');
                if (hasExtra) {
                    const extraClause = `extra = COALESCE(extra, '{}') || ${cms.db.dbStr(JSON.stringify(jsonFields))}::jsonb`;
                    setPairs = setPairs ? setPairs + ', ' + extraClause : extraClause;
                }
                const idSafe      = pkNumeric ? id : cms.db.dbStr(id);
                const worldClause = noWorldId ? '' : ` AND SiteID = ${cms.db.dbStr(cms.siteId)}`;
                const sql = `UPDATE ${table} SET ${setPairs} WHERE ${primaryKey} = ${idSafe}${worldClause}`;
                await cms.db.ExecuteSQL(sql);
                savedId = id;
            }

            await cms.db.Close();
            cms.ReturnJson = { success: true, id: savedId };

        } catch (err) {
            cms.logError('admin/editlist-save SQL error: ' + err.message);
            cms.ReturnJson = { success: false, error: 'Database error [err-els-006]' };
        }
    }
};
