-- Synthetic registered content approver; caller owns rollback or disposable CI lifecycle.
insert into auth.users(id,email) values('b5141000-0000-4000-8000-000000000001','synthetic-platform-founder@example.invalid');
insert into private.platform_principals(user_id,role,label)
 values('b5141000-0000-4000-8000-000000000001','founder','Synthetic human approver');
