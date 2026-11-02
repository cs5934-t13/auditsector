INSERT IGNORE INTO users
    (first_name, last_name, email, username, password_hash, user_role, user_status)
VALUES
    ('Zachary', 'Ferguson', 'ferguszo@vt.edu', 'ferguszo', '$argon2id$v=19$m=65536,t=3,p=4$/vjSu9mDj6OyKYjX/6HXdQ$C3Pm4Tno+ivIiBPS7t+vpNZxtOXV5wVGd+ejJsTDLCs', 'ADMIN', 'ACTIVE'),
    ('John', 'Smith', 'smith@vt.edu', 'jsmith', '$argon2id$v=19$m=65536,t=3,p=4$/vjSu9mDj6OyKYjX/6HXdQ$C3Pm4Tno+ivIiBPS7t+vpNZxtOXV5wVGd+ejJsTDLCs', 'ANALYST', 'ACTIVE'),
    ('Jane', 'Doe', 'jdoe@vt.edu', 'jdoe', '$argon2id$v=19$m=65536,t=3,p=4$/vjSu9mDj6OyKYjX/6HXdQ$C3Pm4Tno+ivIiBPS7t+vpNZxtOXV5wVGd+ejJsTDLCs', 'ANALYST', 'INACTIVE');