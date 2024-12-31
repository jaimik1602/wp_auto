<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>View Entries</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/js/bootstrap.bundle.min.js"></script>
</head>

<body>

    <div class="container my-4">
        <h2 class="text-center mb-4">Vehicle Entries</h2>

        <!-- Search Bar -->
        <input type="text" id="search" class="form-control"
            placeholder="Search by Vehicle Number, IMEI or Mobile Number">

        <!-- Table for Vehicle Entries -->
        <table class="table table-bordered mt-4 text-center" id="entriesTable">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Vehicle Number</th>
                    <th>IMEI</th>
                    <th>Expiry Date</th>
                    <th>Mobile Number</th>
                    <th>GST Number</th>
                    <th>Transaction Id</th>
                    <th>Amount</th>
                    <th>Payment Status</th>
                    <th>Reminder Count</th>
                    <th>Entry Date (IST)</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody id="entries">
                <!-- Entries will be dynamically inserted here -->
            </tbody>
        </table>

        <!-- Pagination -->
        <nav aria-label="Page navigation">
            <ul class="pagination justify-content-center" id="pagination">
                <!-- Pagination links will be dynamically inserted here -->
            </ul>
        </nav>
    </div>

    <script>
        $(document).ready(function () {
            // Initial Load
            loadEntries('', 1);

            // Real-time search
            $('#search').on('input', function () {
                var searchValue = $(this).val();
                loadEntries(searchValue, 1);
            });

            // Event delegation for pagination
            $('#pagination').on('click', '.page-link', function () {
                const page = $(this).data('page');
                const searchValue = $('#search').val();
                loadEntries(searchValue, page);
            });
        });

        // Function to load entries
        function loadEntries(search, page) {
            $.ajax({
                url: 'fetch_entries.php',
                method: 'POST',
                data: {
                    search: search,
                    page: page
                },
                success: function (response) {
                    const data = JSON.parse(response);

                    // Populate table rows
                    let rows = '';
                    data.entries.forEach(function (entry) {
                        let utcDate = new Date(entry.created_at);
                        let istDate = new Date(utcDate.getTime() + (5 * 60 + 30) * 60 * 1000);
                        let formattedDate = ('0' + istDate.getDate()).slice(-2) + '-' +
                            ('0' + (istDate.getMonth() + 1)).slice(-2) + '-' +
                            istDate.getFullYear();
                        rows += `<tr>
                            <td>${entry.company_person_name}</td>
                            <td>${entry.vehicle_number}</td>
                            <td>${entry.imei}</td>
                            <td>${entry.expiry_date}</td>
                            <td>${entry.mobile_number}</td>
                            <td>${entry.gst_number}</td>
                            <td>${entry.transaction_id}</td>
                            <td>${entry.amount}</td>
                            <td>${entry.payment_status}</td>
                            <td>${entry.reminder_count}</td>
                            <td>${istDate.toLocaleString()}</td>
                            <td>
                            ${entry.payment_status === 'Paid'
                                ? `<button class="btn btn-success btn-sm" onclick="sendInvoice('${entry.transaction_id}', '${entry.mobile_number}', 'invoice_${sanitizeName(entry.company_person_name)}_${entry.transaction_id}${entry.reminder_count > 1 ? '-' + (entry.reminder_count - 1) : ''}.pdf')">Send Invoice</button>`
                                : `<button class="btn btn-warning btn-sm" onclick="remindAgain('${entry.transaction_id}', '${entry.mobile_number}')">Remind Again</button>`
                            } 
                                <button class="btn btn-danger btn-sm" onclick="deleteEntry('${entry.transaction_id}')">Delete</button>
                            </td>
                        </tr>`;
                    });

                    $('#entries').html(rows);

                    // Populate pagination links
                    let pagination = '';
                    for (let i = 1; i <= data.totalPages; i++) {
                        pagination += `<li class="page-item ${i === data.currentPage ? 'active' : ''}">
                            <a class="page-link" href="javascript:void(0);" data-page="${i}">${i}</a>
                        </li>`;
                    }
                    $('#pagination').html(pagination);
                }
            });
        }

        // Function to sanitize name for file generation
        function sanitizeName(name) {
            return name.replace(/[^a-zA-Z0-9]/g, '').replace(/\s+/g, '');
        }

        // Function to send invoice
        window.sendInvoice = function (transactionId, mobileNumber, fileName) {
            const fileUrl = `https://app.jaimik.com/payment/invoices/${fileName}`;
            const whatsappApiUrl = `https://app.11za.in/apis/template/sendTemplate`;
            const accessToken = `U2FsdGVkX1+TMheIXUsLLGbGdxqwuRIziWY/jBT5HWNas/DWqsAj8XJwmtoDW2ppdaokuCdQcSLfntswlhA8dk/XcfP9Ej2DUd3XKmxJ/v5/6UFa1KcyAC1dAJYzhFIVFWSkERKan8SuWEEgapOWE7G73WPe83YXa6Zku0IOMCgUaox34AxhPOn7TDVeJCpb`;

            var formdata = new FormData();
            formdata.append("authToken", accessToken);
            formdata.append("sendto", mobileNumber);
            formdata.append("originWebsite", "https://zplus.co.in/");
            formdata.append("templateName", "invoice_msg");
            formdata.append("myfile", fileUrl);
            formdata.append("data", transactionId);
            formdata.append("language", "en");

            fetch(whatsappApiUrl, {
                method: 'POST',
                body: formdata,
                redirect: 'follow'
            })
                .then(response => response.text())
                .then(result => alert("Invoice sent successfully via WhatsApp!"))
                .catch(error => alert("An error occurred while sending the invoice."));
        };

        // Function to send reminders
        window.remindAgain = function (transactionId, mobileNumber) {
            fetch('send_reminder.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ transaction_id: transactionId, mobile_number: mobileNumber })
            })
                .then(response => response.json())
                .then(result => {
                    if (result.success) {
                        alert('Reminder sent successfully!');
                    } else {
                        alert('Failed to send reminder: ' + result.message);
                    }
                })
                .catch(error => alert('An error occurred while sending the reminder.'));
        };

        // Function to confirm delete
        // window.confirmDelete = function (transactionId) {
        //     console.log(transactionId);
        //     if (confirm('Are you sure you want to delete all entries with this transaction ID?')) {
        //         $.ajax({
        //             url: 'delete_entry.php',
        //             method: 'POST',
        //             data: { transaction_id: transactionId },
        //             success: function (response) {
        //                 const result = JSON.parse(response);
        //                 if (result.success) {
        //                     alert('Entries deleted successfully!');
        //                     loadEntries($('#search').val(), 1);
        //                 } else {
        //                     alert('Failed to delete entries: ' + result.message);
        //                 }
        //             },
        //             error: function () {
        //                 alert('An error occurred while deleting the entries.');
        //             }
        //         });
        //     }
        // };
        function deleteEntry(transactionId) {
            if (confirm("Are you sure you want to delete all entries for this Transaction ID?")) {
                fetch('delete_entry.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ transaction_id: transactionId })
                })
                    .then(response => {
                        if (!response.ok) {
                            throw new Error('Network response was not ok');
                        }
                        return response.json(); // Parse JSON response
                    })
                    .then(result => {
                        if (result.success) {
                            alert(result.message);
                            // Optionally reload the entries
                            loadEntries('', 1);
                        } else {
                            alert(result.message);
                        }
                    })
                    .catch(error => {
                        console.error('Error:', error);
                        alert("An error occurred while deleting the entry.");
                    });
            }
        }

    </script>


</body>

</html>